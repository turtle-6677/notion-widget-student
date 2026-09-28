import { Hono } from 'hono';
import { NOTION_DEFAULTS } from '../config/notionConfig';
import { Bindings } from '../index';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
  }
  return btoa(binary);
}

const api = new Hono<{ Bindings: Bindings }>();

// Health check endpoint
api.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'notion-worker',
    runtime: 'Cloudflare Workers (workerd)'
  });
});

// Sample info endpoint
api.get('/info', (c) => {
  return c.json({
    name: 'Cloudflare Worker with Hono',
    version: '1.0.0',
    description: 'High-performance serverless backend on Cloudflare Edge',
    docs: 'https://hono.dev and https://developers.cloudflare.com/workers/'
  });
});

/**
 * 🌟 학생 맞춤 대시보드 실시간 조회 API
 * GET /api/student-dashboard?name=학생이름
 * 
 * [개편된 요구사항]
 * 1. 집숙제: 가장 최근 개별수업에 연결(relation)된 집숙제만 가져와서 표시!
 * 2. 누적 성실도: 숙제가 부여된 개별수업 횟수 중, 해당 수업의 모든 집숙제를 '완료'한 수업 횟수 비율!
 * 3. 진도율: 학생 DB의 '진도율' (숫자) 및 '진도단원' (텍스트) 속성 실시간 조회
 * 4. 적립금: 학생 DB의 '적립금' (숫자) 속성 실시간 조회
 */
api.get('/student-dashboard', async (c) => {
  const id = c.req.query('id')?.trim();
  const name = c.req.query('name')?.trim();
  if (!id && !name) {
    return c.json({ success: false, error: 'Either student ID (?id=) or name (?name=) query parameter is required' }, 400);
  }

  const apiKey = c.env.NOTION_API_KEY || NOTION_DEFAULTS.API_KEY;
  const studentDbId = c.env.NOTION_STUDENT_DB_ID || NOTION_DEFAULTS.STUDENT_DB_ID;
  const homeworkDbId = c.env.NOTION_HOMEWORK_HOME_DB_ID || NOTION_DEFAULTS.HOMEWORK_HOME_DB_ID;
  const classRecordDbId = c.env.NOTION_CLASS_RECORD_DB_ID || NOTION_DEFAULTS.CLASS_RECORD_DB_ID;

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    let studentPage: any = null;
    let studentId = '';

    if (id) {
      // 1-A. 고유 ID(Notion Page ID/UUID)로 직접 조회 (친구 주소 유추 원천 차단)
      const cleanId = id.replace(/-/g, '');
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${cleanId}`, {
        method: 'GET',
        headers
      });
      if (!pageRes.ok) {
        return c.json({ success: false, error: `Student with ID '${id}' not found in Notion` }, 404);
      }
      studentPage = await pageRes.json();
      studentId = studentPage.id;
    } else {
      // 1-B. 학생 DB에서 이름으로 학생 검색
      const studentRes = await fetch(`https://api.notion.com/v1/databases/${studentDbId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: {
            property: '이름',
            title: { equals: name }
          }
        })
      });

      const studentData: any = await studentRes.json();
      if (!studentData.results || studentData.results.length === 0) {
        return c.json({ success: false, error: `Student '${name}' not found in Notion database` }, 404);
      }

      studentPage = studentData.results[0];
      studentId = studentPage.id;
    }

    // 학생 이름 추출
    const studentTitle = studentPage.properties['이름']?.title;
    const studentName = (studentTitle && studentTitle.length > 0)
      ? studentTitle.map((t: any) => t.plain_text).join('')
      : (name || '학생');

    // 2. 개별수업기록 DB에서 해당 학생의 수업기록을 날짜 내림차순(최신순)으로 조회
    const crRes = await fetch(`https://api.notion.com/v1/databases/${classRecordDbId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filter: {
          property: '🧑‍🎓학생',
          relation: { contains: studentId }
        },
        sorts: [
          { property: '날짜', direction: 'descending' }
        ],
        page_size: 50
      })
    });
    const crData: any = await crRes.json();
    const crResults = crData.results || [];

    // 출결 및 연속 출석(streak) 계산
    // 🌟 [요구사항 반영]: 지각, 보강, 출석, 조퇴 모두 출석으로 카운트!
    const isAttended = (status?: string) => {
      if (!status) return false;
      return ['출석', '지각', '보강', '조퇴'].includes(status.trim());
    };

    // 출결이 이미 체크된 기록들만 모수로 하여 출석률 계산 (당일 수업 전 미출결 기록이 출석률을 깎지 않도록)
    const recordsWithAttendance = crResults.filter((p: any) => Boolean(p.properties['출결']?.select?.name));
    const totalRecords = recordsWithAttendance.length;
    const presentRecords = recordsWithAttendance.filter((p: any) => {
      const att = p.properties['출결']?.select?.name;
      return isAttended(att);
    }).length;
    const attendanceRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 100;

    let streak = 0;
    for (const p of crResults) {
      const att = p.properties['출결']?.select?.name;
      if (!att) {
        // 출결이 아직 입력되지 않은 수업기록(예: 오늘 수업 시작 전)은 스트릭을 끊지 않고 건너뜀
        continue;
      }
      if (isAttended(att)) {
        streak++;
      } else {
        break;
      }
    }

    // 3. 🌟 가장 최근 유효 개별수업에 연결(relation)된 집숙제 가져오기
    // [개선]: 학생이 결석(또는 당일 수업 전이라 숙제 미부여)인 경우, 이전 수업기록을 탐색하여 미완수/부여된 집숙제를 계속 표시!
    let displayTasks: any[] = [];
    let recentChapter = '수업 진도';
    let targetClassRecord: any = null;

    if (crResults.length > 0) {
      for (let i = 0; i < crResults.length; i++) {
        const cr = crResults[i];
        const att = cr.properties['출결']?.select?.name?.trim();
        const hwRels = cr.properties['🏠집숙제']?.relation || [];

        // 1) 해당 수업기록에 집숙제가 직접 연결되어 있는 경우 -> 바로 선택
        if (hwRels.length > 0) {
          targetClassRecord = cr;
          break;
        }

        // 2) 집숙제가 0개인 경우:
        // - '결석': 학생이 결석하여 새 숙제가 없고 기존 숙제 검사도 못했으므로 이전 수업 숙제 탐색 계속
        // - 출결 미입력(빈값): 수업 전이거나 진행 중으로 새 숙제가 아직 등록되지 않았으므로 이전 숙제 탐색 계속
        if (att === '결석' || !att) {
          continue;
        }

        // - 정상 출석(출석, 지각, 보강, 조퇴 등)했으나 숙제가 실제로 0개 부여된 경우 -> 숙제 없음으로 확정 종료
        targetClassRecord = cr;
        break;
      }

      // 만약 위 루프에서 targetClassRecord를 못 찾았다면 첫 번째 기록을 기본으로 사용
      if (!targetClassRecord) {
        targetClassRecord = crResults[0];
      }

      const firstRecTitle = targetClassRecord.properties['수업기록']?.title?.[0]?.plain_text;
      if (firstRecTitle) {
        recentChapter = firstRecTitle.split('_')[1] || firstRecTitle;
      }

      const relatedHomeworks = targetClassRecord.properties['🏠집숙제']?.relation || [];

      if (relatedHomeworks.length > 0) {
        const hwPromises = relatedHomeworks.map(async (rel: { id: string }) => {
          try {
            const pageRes = await fetch(`https://api.notion.com/v1/pages/${rel.id}`, { headers });
            if (!pageRes.ok) return null;
            const hwPage: any = await pageRes.json();
            const titleList = hwPage.properties['집숙제 내용']?.title || [];
            const title = titleList.length > 0 ? titleList[0].plain_text : '집숙제';
            const status = hwPage.properties['완료여부']?.select?.name || '미완료';
            const isDone = status === '완료';
            return {
              id: hwPage.id,
              text: title,
              done: isDone,
              status: status,
              date: hwPage.properties['숙제 낸 날짜']?.date?.start || ''
            };
          } catch {
            return null;
          }
        });

        const resolved = await Promise.all(hwPromises);
        displayTasks = resolved.filter((t: any) => t !== null);
      }
    }

    // 만약 최근 수업에 부여된 숙제가 없으면 빈 배열 [] 반환 (프론트엔드에서 깔끔하게 처리)
    if (displayTasks.length === 0) {
      displayTasks = [];
    }

    // 4. 🌟 [정확한 누적 성실도 정의]:
    // - 단위: 숙제가 부여된 '개별수업' 횟수
    // - 완수 조건: 그 개별수업에 연결된 모든 집숙제가 '완료' 상태여야 함! (반만 하면 인정 X)
    // - 아직 검사 대기 중인('아직 검사 안함') 진행 중 숙제는 분모에서 제외하여 학생의 성실도가 억울하게 깎이지 않도록 보정
    const allHwRes = await fetch(`https://api.notion.com/v1/databases/${homeworkDbId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filter: {
          property: '🧑‍🎓학생',
          relation: { contains: studentId }
        }
      })
    });
    const allHwData: any = await allHwRes.json();
    const allHwResults = allHwData.results || [];

    // 개별수업ID별로 집숙제 완료 상태 목록 그룹화
    const hwByClass: Record<string, string[]> = {};
    for (const hw of allHwResults) {
      const crRels = hw.properties['📖수업기록']?.relation || [];
      const status = hw.properties['완료여부']?.select?.name || '미완료';
      for (const cr of crRels) {
        if (!hwByClass[cr.id]) hwByClass[cr.id] = [];
        hwByClass[cr.id].push(status);
      }
    }

    let totalInspectedClassesWithHw = 0;
    let completedClassesWithHw = 0;

    for (const crId of Object.keys(hwByClass)) {
      const statuses = hwByClass[crId];
      // 연결된 모든 집숙제가 '아직 검사 안함'인 경우(진행 중인 숙제)는 아직 검사 전이므로 성실도 모수에서 제외
      if (statuses.length > 0 && statuses.every(s => s === '아직 검사 안함')) {
        continue;
      }
      totalInspectedClassesWithHw++;
      // 연결된 모든 집숙제가 '완료'여야 1회 완수로 인정!
      if (statuses.length > 0 && statuses.every(s => s === '완료')) {
        completedClassesWithHw++;
      }
    }

    const cumulativeRate = totalInspectedClassesWithHw > 0
      ? Math.round((completedClassesWithHw / totalInspectedClassesWithHw) * 100)
      : 100;

    // 🌟 [숙제 연속 완수 (hwStreak) 계산]
    let hwStreak = 0;
    for (const cr of crResults) {
      const statuses = hwByClass[cr.id];
      if (!statuses || statuses.length === 0) continue; // 숙제 없는 수업은 건너뜀

      if (statuses.every(s => s === '완료')) {
        hwStreak++;
      } else if (statuses.every(s => s === '아직 검사 안함') && hwStreak === 0) {
        // 가장 최근 숙제가 아직 검사 대기중이면 이전 완수 스트릭 유지
        continue;
      } else {
        // 미완료가 있으면 스트릭 종료
        break;
      }
    }

    // 5. 노션 학생 DB의 '적립금' 및 '목표금액' 실시간 조회
    let currentReward: number;
    const rewardProp = studentPage.properties['적립금'] || studentPage.properties['포인트'] || studentPage.properties['마일리지'];
    if (rewardProp && rewardProp.type === 'number' && rewardProp.number !== null && rewardProp.number !== undefined) {
      currentReward = rewardProp.number;
    } else if (rewardProp && rewardProp.type === 'formula' && rewardProp.formula?.number !== null) {
      currentReward = rewardProp.formula.number;
    } else {
      currentReward = 0; // 노션에 적립금이 비어있으면 0원 기본값
    }

    let targetReward = 5000;
    const targetProp = studentPage.properties['목표금액'] || studentPage.properties['목표적립금'] || studentPage.properties['목표'];
    if (targetProp && targetProp.type === 'number' && targetProp.number !== null && targetProp.number !== undefined) {
      targetReward = targetProp.number;
    }

    // 6. 🌟 [진도율 & 진도단원] 학생 DB 실시간 조회 지원
    let progressRate = 72; // 기본값
    const progProp = studentPage.properties['진도율'] || studentPage.properties['진도'];
    if (progProp && progProp.type === 'number' && progProp.number !== null && progProp.number !== undefined) {
      progressRate = progProp.number;
    } else if (progProp && progProp.type === 'formula' && progProp.formula?.number !== null) {
      progressRate = progProp.formula.number;
    }

    let progChapterName = recentChapter;
    const chapterProp = studentPage.properties['진도단원'] || studentPage.properties['단원'] || studentPage.properties['진도명'];
    if (chapterProp && chapterProp.type === 'rich_text' && chapterProp.rich_text?.length > 0) {
      progChapterName = chapterProp.rich_text[0].plain_text;
    } else if (chapterProp && chapterProp.type === 'select' && chapterProp.select?.name) {
      progChapterName = chapterProp.select.name;
    }

    // 🚫 캐시 원천 차단 헤더
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');

    return c.json({
      success: true,
      data: {
        name: studentName,
        studentId,
        reward: currentReward,
        targetReward,
        streak,
        hwStreak,
        attendance: attendanceRate,
        attDone: presentRecords || 19,
        attTotal: totalRecords || 20,
        progress: progressRate,
        progChapter: progChapterName,
        cumulativeRate,
        cumulativeDone: completedClassesWithHw,
        cumulativeTotal: totalInspectedClassesWithHw || 1,
        tasks: displayTasks
      }
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * 🌟 노션 버튼/링크 클릭 시 100원 자동 적립 및 숙제 완료 처리 API
 * GET /api/add-reward?hwId=노션집숙제페이지ID
 */
api.get('/add-reward', async (c) => {
  const hwId = c.req.query('hwId')?.trim().replace(/-/g, '');
  const apiKey = c.env.NOTION_API_KEY || NOTION_DEFAULTS.API_KEY;
  const homeworkDbId = c.env.NOTION_HOMEWORK_HOME_DB_ID || NOTION_DEFAULTS.HOMEWORK_HOME_DB_ID;

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    let targetPages: any[] = [];

    // 1. 만약 특정 hwId가 전달된 경우 해당 페이지 1건 처리
    if (hwId) {
      const singleRes = await fetch(`https://api.notion.com/v1/pages/${hwId}`, { headers });
      if (singleRes.ok) {
        targetPages.push(await singleRes.json());
      }
    } else {
      // 2. 🌟 노션 버튼에 고정 URL만 넣었을 때: 집숙제 DB에서 check == true 인 모든 숙제 자동 검색!
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${homeworkDbId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: {
            property: 'check',
            checkbox: { equals: true }
          }
        })
      });
      if (queryRes.ok) {
        const queryData: any = await queryRes.json();
        targetPages = queryData.results || [];
      }
    }

    // check 켜진 숙제가 없을 때
    if (targetPages.length === 0) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <title>check 확인 필요</title>
          <style>
            body { background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; border: 1.5px solid #f59e0b; border-radius: 16px; padding: 36px 30px; text-align: center; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .btn { margin-top: 20px; background: #3b82f6; color: white; border: none; padding: 10px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <div style="font-size: 3.2rem; margin-bottom: 12px;">⚠️</div>
            <h2 style="color: #facc15; margin: 0 0 12px 0;">[check] 가 켜진 숙제가 없습니다</h2>
            <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.6;">
              집숙제 DB에서 <b>check 박스에 체크(V)</b>를 하신 후<br>버튼을 다시 눌러주세요!
            </p>
            <button class="btn" onclick="window.close()">창 닫기 (3초 후 자동 종료)</button>
          </div>
          <script>setTimeout(() => window.close(), 3500);</script>
        </body>
        </html>
      `);
    }

    // 3. check 켜진 숙제들 처리 및 학생 적립금 +100 가산
    const todayStr = new Date().toISOString().split('T')[0];
    const processedStudents: Record<string, { name: string; oldReward: number; newReward: number; count: number }> = {};

    for (const hwPage of targetPages) {
      const studentRels = hwPage.properties['🧑‍🎓학생']?.relation || [];
      if (studentRels.length === 0) continue;

      const studentId = studentRels[0].id;

      // 학생 정보 및 적립금 조회
      if (!processedStudents[studentId]) {
        const studentRes = await fetch(`https://api.notion.com/v1/pages/${studentId}`, { headers });
        if (studentRes.ok) {
          const studentPage: any = await studentRes.json();
          const studentName = studentPage.properties['이름']?.title?.[0]?.plain_text || '학생';
          const curReward = studentPage.properties['적립금']?.number || 0;
          processedStudents[studentId] = {
            name: studentName,
            oldReward: curReward,
            newReward: curReward,
            count: 0
          };
        }
      }

      if (processedStudents[studentId]) {
        processedStudents[studentId].newReward += 100;
        processedStudents[studentId].count += 1;
      }

      // 숙제 상태 업데이트: check 끄기 + 완료여부 '완료' + 검사일 오늘 날짜
      await fetch(`https://api.notion.com/v1/pages/${hwPage.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          properties: {
            'check': { checkbox: false },
            '완료여부': { select: { name: '완료' } },
            '검사일': { date: { start: todayStr } }
          }
        })
      });
    }

    // 학생 DB의 '적립금' 업데이트
    for (const [stId, info] of Object.entries(processedStudents)) {
      await fetch(`https://api.notion.com/v1/pages/${stId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          properties: {
            '적립금': { number: info.newReward }
          }
        })
      });
    }

    // 성공 결과 안내 HTML
    const studentSummaries = Object.values(processedStudents).map(
      s => `<div style="margin: 8px 0; font-size: 1.1rem; color: #f8fafc;">
        <b>${s.name}</b> 학생: <b>+${(s.count * 100).toLocaleString()}원</b> (현재: ₩${s.newReward.toLocaleString()})
      </div>`
    ).join('');

    return c.html(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <title>🪙 적립 완료!</title>
        <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
        <style>
          body { background: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #111827; border: 2px solid #facc15; border-radius: 20px; padding: 36px 30px; text-align: center; max-width: 440px; box-shadow: 0 0 35px rgba(250, 204, 21, 0.25); }
          .badge { background: rgba(59, 130, 246, 0.2); color: #93c5fd; padding: 6px 14px; border-radius: 999px; font-weight: bold; font-size: 0.9rem; display: inline-block; margin-bottom: 12px; }
          .sub { color: #94a3b8; font-size: 0.88rem; line-height: 1.5; margin: 18px 0; }
          .btn { background: #2563eb; color: white; border: none; padding: 12px 28px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 0.95rem; }
          .btn:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">검사 완료 및 적립 성공</span>
          <div style="font-size: 3.2rem; margin: 8px 0;">🪙</div>
          <h2 style="margin: 0 0 14px 0; color: #fef08a;">적립이 완료되었습니다!</h2>
          <div style="background: rgba(15, 23, 42, 0.7); border-radius: 12px; padding: 14px; border: 1px solid rgba(255,255,255,0.08);">
            ${studentSummaries}
          </div>
          <p class="sub">
            ✅ 집숙제가 <b>[완료]</b> 처리되었으며<br>
            중복 적립 방지를 위해 <b>check</b>가 자동 해제되었습니다.
          </p>
          <button class="btn" onclick="window.close()">창 닫기 (3초 후 자동 종료)</button>
        </div>
        <script>
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
          setTimeout(() => window.close(), 3500);
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    return c.html(`<h2>오류 발생: ${err.message}</h2>`, 500);
  }
});

/**
 * 🌟 학생 DB에서 직접 버튼/링크 클릭 시 해당 학생 적립금 +100원 가산 API
 * GET /api/add-student-reward?name=학생이름 OR ?id=학생페이지ID (&amount=100)
 */
api.get('/add-student-reward', async (c) => {
  const name = c.req.query('name')?.trim();
  const idParam = c.req.query('id')?.trim().replace(/-/g, '') || c.req.query('studentId')?.trim().replace(/-/g, '');
  const amount = parseInt(c.req.query('amount') || '100', 10);

  const apiKey = c.env.NOTION_API_KEY || NOTION_DEFAULTS.API_KEY;
  const studentDbId = c.env.NOTION_STUDENT_DB_ID || NOTION_DEFAULTS.STUDENT_DB_ID;

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    let studentPage: any = null;

    // 1. ID가 전달된 경우 페이지 직접 조회
    if (idParam) {
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${idParam}`, { headers });
      if (pageRes.ok) {
        studentPage = await pageRes.json();
      }
    }

    // 2. 이름으로 조회
    if (!studentPage && name) {
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${studentDbId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: {
            property: '이름',
            title: { equals: name }
          }
        })
      });
      if (queryRes.ok) {
        const queryData: any = await queryRes.json();
        if (queryData.results && queryData.results.length > 0) {
          studentPage = queryData.results[0];
        }
      }
    }

    if (!studentPage) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ko">
        <head><meta charset="UTF-8"><title>학생 조회 실패</title></head>
        <body style="background:#0f172a;color:#f87171;font-family:sans-serif;padding:40px;text-align:center;">
          <h2>⚠️ 학생 정보를 찾을 수 없습니다</h2>
          <p>전달된 이름/ID: ${name || idParam || '없음'}</p>
        </body></html>
      `, 404);
    }

    const studentName = studentPage.properties['이름']?.title?.[0]?.plain_text || '학생';
    const curReward = studentPage.properties['적립금']?.number || 0;
    const newReward = curReward + amount;

    // 3. 학생 적립금 +amount 가산 업데이트
    await fetch(`https://api.notion.com/v1/pages/${studentPage.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        properties: {
          '적립금': { number: newReward }
        }
      })
    });

    // 4. 성공 HTML 응답
    return c.html(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <title>🪙 ${studentName} 학생 +${amount}원 적립 완료!</title>
        <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
        <style>
          body { background: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #111827; border: 2px solid #facc15; border-radius: 20px; padding: 36px 30px; text-align: center; max-width: 420px; box-shadow: 0 0 35px rgba(250, 204, 21, 0.25); }
          .badge { background: rgba(59, 130, 246, 0.2); color: #93c5fd; padding: 6px 14px; border-radius: 999px; font-weight: bold; font-size: 0.9rem; display: inline-block; margin-bottom: 12px; }
          .amount { font-size: 2.2rem; font-weight: 800; color: #facc15; margin: 16px 0; text-shadow: 0 0 12px rgba(250,204,21,0.4); }
          .sub { color: #94a3b8; font-size: 0.88rem; line-height: 1.5; margin-bottom: 24px; }
          .btn { background: #2563eb; color: white; border: none; padding: 12px 28px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 0.95rem; }
          .btn:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">🧑‍🎓 ${studentName} 학생</span>
          <div style="font-size: 3.2rem; margin: 8px 0;">🪙</div>
          <h2 style="margin: 0; color: #fef08a;">+${amount.toLocaleString()}원이 적립되었습니다!</h2>
          <div class="amount">현재 적립금: ₩${newReward.toLocaleString()}</div>
          <p class="sub">
            노션 <b>학생 DB</b>의 적립금이 실시간으로 갱신되었습니다.<br>
            위젯에도 즉시 반영됩니다.
          </p>
          <button class="btn" onclick="window.close()">창 닫기 (3초 후 자동 종료)</button>
        </div>
        <script>
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
          setTimeout(() => window.close(), 3500);
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    return c.html(`<h2>오류 발생: ${err.message}</h2>`, 500);
  }
});

/**
 * 🌟 📥 파일 다운로드 CORS 프록시 API (구글 드라이브 / 노션 S3 파일 클라이언트 전달용)
 * GET /api/file-proxy?url=...
 */
api.get('/file-proxy', async (c) => {
  const fileUrl = c.req.query('url');
  if (!fileUrl) {
    return c.text('URL parameter is required', 400);
  }

  try {
    let targetUrl = fileUrl;
    if (targetUrl.includes('drive.google.com')) {
      const gMatch = targetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || targetUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (gMatch && gMatch[1]) {
        targetUrl = `https://drive.google.com/uc?export=download&id=${gMatch[1]}`;
      }
    }

    const res = await fetch(targetUrl);
    if (!res.ok) {
      return c.text(`Failed to fetch file: ${res.statusText}`, (res.status >= 400 && res.status < 600 ? res.status : 500) as any);
    }

    const contentType = res.headers.get('content-type') || 'application/pdf';
    const blob = await res.arrayBuffer();

    return new Response(blob, {
      headers: {
        'Content-Type': contentType.includes('pdf') || targetUrl.endsWith('.pdf') ? 'application/pdf' : contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    return c.text(`Error proxying file: ${err.message}`, 500);
  }
});

/**
 * 🌟 📝 노션 시험 결과 저장 API
 * POST /api/save-exam-result
 */
api.post('/save-exam-result', async (c) => {
  const apiKey = c.env?.NOTION_API_KEY || NOTION_DEFAULTS.API_KEY;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    const body: any = await c.req.json();
    const { examId, score, feedback } = body;
    if (!examId) {
      return c.json({ success: false, error: 'examId is required' }, 400);
    }

    const cleanExamId = String(examId).replace(/^https:\/\/.*notion\.so\//, '').replace(/-/g, '').split('?')[0];

    const updateRes = await fetch(`https://api.notion.com/v1/pages/${cleanExamId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        properties: {
          '점수': { number: score },
          '피드백': { rich_text: [{ text: { content: feedback || '' } }] }
        }
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return c.json({ success: false, error: `Notion update failed: ${errText}` }, 500);
    }

    return c.json({ success: true, examId: cleanExamId, score, feedback });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * 🌟 📝 AI 시험 자동 채점 & 피드백 생성 API
 * GET /api/auto-grade-exam?examId=노션시험페이지ID
 */
export async function handleAutoGradeExam(c: any) {
  const examIdParam = c.req.query('examId')?.trim() || c.req.query('id')?.trim() || c.req.query('recordId')?.trim() || c.req.query('pageId')?.trim();
  const apiKey = c.env?.NOTION_API_KEY || NOTION_DEFAULTS.API_KEY;
  const geminiKey = c.env?.GEMINI_API_KEY || NOTION_DEFAULTS.GEMINI_API_KEY;

  if (!examIdParam) {
    return c.html(`
      <!DOCTYPE html>
      <html lang="ko">
      <head><meta charset="UTF-8"><title>시험 ID 필요</title></head>
      <body style="background:#0f172a;color:#f87171;font-family:sans-serif;padding:40px;text-align:center;">
        <h2>⚠️ 시험 페이지 ID(examId)가 전달되지 않았습니다</h2>
        <p>노션 수식 링크에 <code>?examId=...</code> 파라미터가 포함되어 있는지 확인해주세요.</p>
      </body></html>
    `, 400);
  }

  const cleanExamId = examIdParam.replace(/^https:\/\/.*notion\.so\//, '').replace(/-/g, '').split('?')[0];

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    // 1. 노션 시험 페이지 데이터 조회
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${cleanExamId}`, { headers });
    if (!pageRes.ok) {
      throw new Error(`노션 시험 페이지(ID: ${cleanExamId})를 찾을 수 없습니다: ${pageRes.statusText}`);
    }
    const examPage: any = await pageRes.json();

    const titleList = examPage.properties['시험명']?.title || [];
    const title = titleList.length > 0 ? titleList[0].plain_text : '시험';
    const wrongList = examPage.properties['오답']?.rich_text || [];
    const wrong = wrongList.length > 0 ? wrongList.map((t: any) => t.plain_text).join('') : '';
    const maxScore = 100; // 만점기준은 항상 100점으로 고정
    const category = examPage.properties['시험구분']?.select?.name || '쪽지시험';

    // 학생 정보 조회 (선택)
    let studentName = '학생';
    const studentRels = examPage.properties['🧑‍🎓학생']?.relation || [];
    if (studentRels.length > 0) {
      try {
        const stRes = await fetch(`https://api.notion.com/v1/pages/${studentRels[0].id}`, { headers });
        if (stRes.ok) {
          const stPage: any = await stRes.json();
          studentName = stPage.properties['이름']?.title?.[0]?.plain_text || '학생';
        }
      } catch {}
    }

    // 시험지 첨부 파일 확인 (Notion S3 또는 구글 드라이브 등)
    const filesList = examPage.properties['시험파일']?.files || [];
    let fileUrl = '';
    let fileName = '';

    if (filesList.length > 0) {
      const firstFile = filesList[0];
      fileName = firstFile.name || '시험지';
      const rawUrl = firstFile.file?.url || firstFile.external?.url || firstFile.name || '';
      if (rawUrl.includes('drive.google.com')) {
        const gMatch = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || rawUrl.match(/id=([a-zA-Z0-9_-]+)/);
        if (gMatch && gMatch[1]) {
          fileUrl = `https://drive.google.com/uc?export=download&id=${gMatch[1]}`;
        } else {
          fileUrl = rawUrl;
        }
      } else {
        fileUrl = rawUrl;
      }
    }

    // 클라이언트 브라우저에서 직접 Gemini API 호출하여 한국 IP로 확실하게 채점 수행
    const configJson = JSON.stringify({
      cleanExamId,
      title,
      wrong,
      maxScore: 100,
      category,
      studentName,
      fileUrl,
      fileName,
      geminiKey
    });

    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');

    return c.html(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🤖 AI 자동 채점 - ${title}</title>
        <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
        <link href="https://fonts.googleapis.com/css2?family=Pretendard:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Pretendard', -apple-system, sans-serif; }
          body { background: radial-gradient(circle at top, #1e293b 0%, #0b0f19 100%); color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
          .card { background: #111827; border: 1.5px solid #3b82f6; border-radius: 24px; padding: 36px 28px; text-align: center; max-width: 480px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 30px rgba(59,130,246,0.25); animation: pop 0.3s ease-out; }
          @keyframes pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
          .badge { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59,130,246,0.4); padding: 6px 16px; border-radius: 999px; font-weight: 700; font-size: 0.85rem; display: inline-block; margin-bottom: 14px; }
          .title { font-size: 1.25rem; font-weight: 800; color: #f8fafc; margin-bottom: 6px; }
          .student { font-size: 0.95rem; color: #94a3b8; margin-bottom: 20px; }
          .loading-box { padding: 26px 10px; }
          .spinner { width: 44px; height: 44px; border: 4px solid rgba(59, 130, 246, 0.2); border-top: 4px solid #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .status-text { color: #38bdf8; font-weight: 700; font-size: 1.05rem; }
          .sub-text { color: #64748b; font-size: 0.85rem; margin-top: 6px; }
          .timer-text { color: #f59e0b; font-size: 0.8rem; font-weight: 600; margin-top: 10px; }
          .score-box { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px; margin-bottom: 20px; display: none; }
          .score-label { font-size: 0.85rem; color: #94a3b8; margin-bottom: 4px; }
          .score-value { font-size: 2.5rem; font-weight: 800; color: #facc15; text-shadow: 0 0 16px rgba(250,204,21,0.3); }
          .score-rate { font-size: 1rem; color: #38bdf8; font-weight: 700; margin-top: 4px; }
          .feedback-box { background: rgba(30, 41, 59, 0.6); border-left: 4px solid #38bdf8; border-radius: 10px; padding: 14px 16px; text-align: left; font-size: 0.9rem; line-height: 1.6; color: #e2e8f0; margin-bottom: 24px; display: none; }
          .feedback-title { font-weight: 700; color: #93c5fd; font-size: 0.85rem; margin-bottom: 4px; }
          .btn { background: #2563eb; color: white; border: none; padding: 12px 28px; border-radius: 12px; cursor: pointer; font-weight: 700; font-size: 0.95rem; width: 100%; transition: background 0.2s; display: none; }
          .btn:hover { background: #1d4ed8; }
          .auto-msg { color: #64748b; font-size: 0.78rem; margin-top: 10px; display: none; }
          .error-box { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 12px; padding: 16px; color: #f87171; font-size: 0.9rem; line-height: 1.5; margin-top: 16px; display: none; text-align: left; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge" id="badgeText">🤖 AI 자동 채점 중</span>
          <div class="title">${title}</div>
          <div class="student">🧑‍🎓 ${studentName} 학생 | 100점 만점</div>

          <div class="loading-box" id="loadingBox">
            <div class="spinner"></div>
            <div class="status-text" id="statusText">📥 1단계: 시험지 파일 로드 중...</div>
            <div class="sub-text" id="subStatusText">잠시만 기다려주세요.</div>
            <div class="timer-text" id="timerText">⏱️ 0초 경과</div>
          </div>

          <div class="score-box" id="scoreBox">
            <div class="score-label">최종 산출 점수</div>
            <div class="score-value" id="scoreValue">0점</div>
            <div class="score-rate" id="scoreRate">성취도: 0%</div>
          </div>

          <div class="feedback-box" id="feedbackBox">
            <div class="feedback-title">📝 AI 학습 진단 피드백:</div>
            <div id="feedbackText"></div>
          </div>

          <button class="btn" id="closeBtn" onclick="window.close()">창 닫기 (3초 후 자동 종료)</button>
          <div class="auto-msg" id="autoMsg">✅ 노션 시험 DB의 [점수]와 [피드백]이 실시간으로 갱신되었습니다.</div>
          <div class="error-box" id="errorBox"></div>
        </div>

        <script>
          const data = ${configJson};

          let startTime = Date.now();
          const timerInterval = setInterval(function() {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const timerEl = document.getElementById('timerText');
            if (timerEl) timerEl.innerText = '⏱️ ' + elapsed + '초 경과';
          }, 500);

          function blobToBase64(blob) {
            return new Promise(function(resolve, reject) {
              const reader = new FileReader();
              reader.onloadend = function() {
                const base64data = reader.result.split(',')[1];
                resolve(base64data);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }

          async function runGrading() {
            const statusText = document.getElementById('statusText');
            const subStatusText = document.getElementById('subStatusText');
            const loadingBox = document.getElementById('loadingBox');
            const scoreBox = document.getElementById('scoreBox');
            const feedbackBox = document.getElementById('feedbackBox');
            const closeBtn = document.getElementById('closeBtn');
            const autoMsg = document.getElementById('autoMsg');
            const badgeText = document.getElementById('badgeText');
            const errorBox = document.getElementById('errorBox');

            try {
              let inlineFilePart = null;
              let fileInfoText = '';

              if (data.fileUrl) {
                statusText.innerText = '📥 1단계: 시험지 파일 다운로드 중...';
                subStatusText.innerText = data.fileName || '시험지';
                fileInfoText = '- 첨부 시험지 파일: ' + (data.fileName || '시험지');

                try {
                  const proxyUrl = '/api/file-proxy?url=' + encodeURIComponent(data.fileUrl);
                  let fRes = await fetch(proxyUrl);
                  if (!fRes.ok) {
                    fRes = await fetch(data.fileUrl);
                  }
                  if (fRes.ok) {
                    const blob = await fRes.blob();
                    if (blob.size > 0 && blob.size < 18 * 1024 * 1024) {
                      const base64 = await blobToBase64(blob);
                      const cType = blob.type || 'application/pdf';
                      inlineFilePart = {
                        inlineData: {
                          mimeType: cType.includes('pdf') || (data.fileName && data.fileName.endsWith('.pdf')) ? 'application/pdf' : cType,
                          data: base64
                        }
                      };
                    }
                  }
                } catch (fErr) {
                  console.warn('File download skipped:', fErr);
                }
              }

              statusText.innerText = '🤖 2단계: Gemini 3.6 AI 정밀 채점 중...';
              subStatusText.innerText = '문항별 배점과 오답 원인을 종합 분석하고 있습니다.';

              const promptLines = [
                '당신은 전문 수학 강사이자 공정한 채점 및 학습 진단 AI입니다.',
                '다음 학생의 시험 정보를 분석하여 최종 점수와 1~2문장의 학습 진단 피드백을 산출해주세요.',
                '',
                '[시험 정보]',
                '- 시험명: ' + data.title + ' (' + data.category + ')',
                '- 대상 학생: ' + data.studentName,
                '- 만점 기준: ' + data.maxScore + '점',
                '- 오답 정보: ' + (data.wrong || '오답 없음 (전 문항 정답)'),
                fileInfoText,
                '',
                '[채점 및 피드백 가이드]',
                '1. 오답 정보가 없거나 비어있거나 "오답 없음"인 경우 점수는 만점(' + data.maxScore + '점)입니다.',
                '2. 오답 번호가 있는 경우, 만점(' + data.maxScore + '점) 대비 틀린 문항의 감점 또는 문항 비율을 계산하여 합리적인 최종 점수(정수 또는 소수점 첫째 자리)를 산출하세요.',
                '3. 피드백은 1~2문장으로 학생의 강점(맞은 문제 기반)과 핵심 보완점(오답 분석 기반)을 친절하고 전문적인 어조로 작성하세요.',
                '',
                '다음 JSON 형식으로만 응답하세요:',
                '{',
                '  "score": 85,',
                '  "feedback": "기본 개념과 계산 문제는 우수하나, 삼각형의 합동 조건과 고난도 응용 문항에 대한 추가 오답 클리닉이 필요합니다."',
                '}'
              ];
              const promptText = promptLines.join('\\n');

              const parts = [];
              if (inlineFilePart) {
                parts.push(inlineFilePart);
              }
              parts.push({ text: promptText });

              // 고속 최신 모델 순서로 호출
              const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash'];
              let result = null;
              let attemptErrors = [];

              for (const model of models) {
                try {
                  const gRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + data.geminiKey, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: [{ parts: parts }],
                      generationConfig: { responseMimeType: 'application/json' }
                    })
                  });

                  if (gRes.ok) {
                    const gData = await gRes.json();
                    const rawOutput = gData.candidates && gData.candidates[0] && gData.candidates[0].content && gData.candidates[0].content.parts && gData.candidates[0].content.parts[0] ? gData.candidates[0].content.parts[0].text : '';
                    if (rawOutput) {
                      let cleanJson = rawOutput.trim();
                      const firstBrace = cleanJson.indexOf('{');
                      const lastBrace = cleanJson.lastIndexOf('}');
                      if (firstBrace !== -1 && lastBrace !== -1) {
                        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
                      }
                      result = JSON.parse(cleanJson);
                      break;
                    }
                  } else {
                    const errText = await gRes.text();
                    attemptErrors.push('[' + model + '] ' + gRes.status + ': ' + errText);
                  }
                } catch (mErr) {
                  attemptErrors.push('[' + model + '] ' + mErr.message);
                }
              }

              // 텍스트 폴백 시도
              if (!result && inlineFilePart) {
                for (const model of models) {
                  try {
                    const gRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + data.geminiKey, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        contents: [{ parts: [{ text: promptText }] }],
                        generationConfig: { responseMimeType: 'application/json' }
                      })
                    });

                    if (gRes.ok) {
                      const gData = await gRes.json();
                      const rawOutput = gData.candidates && gData.candidates[0] && gData.candidates[0].content && gData.candidates[0].content.parts && gData.candidates[0].content.parts[0] ? gData.candidates[0].content.parts[0].text : '';
                      if (rawOutput) {
                        let cleanJson = rawOutput.trim();
                        const firstBrace = cleanJson.indexOf('{');
                        const lastBrace = cleanJson.lastIndexOf('}');
                        if (firstBrace !== -1 && lastBrace !== -1) {
                          cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
                        }
                        result = JSON.parse(cleanJson);
                        break;
                      }
                    }
                  } catch (e) {}
                }
              }

              if (!result) {
                throw new Error('Gemini AI 응답 생성에 실패했습니다: ' + attemptErrors.join(' | '));
              }

              const finalScore = Math.min(data.maxScore, Math.max(0, Math.round(result.score * 10) / 10));
              const finalFeedback = (result.feedback || '').trim();
              const ratePct = data.maxScore > 0 ? Math.round((finalScore / data.maxScore) * 100) : 100;

              // 3. 노션 시험 DB에 저장
              statusText.innerText = '💾 3단계: 노션 DB에 점수 및 피드백 저장 중...';
              subStatusText.innerText = '점수: ' + finalScore + '점 (' + ratePct + '%)';

              const saveRes = await fetch('/api/save-exam-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  examId: data.cleanExamId,
                  score: finalScore,
                  feedback: finalFeedback
                })
              });

              if (!saveRes.ok) {
                throw new Error('노션 DB 저장에 실패했습니다: ' + await saveRes.text());
              }

              // 4. 완료 UI 전환
              clearInterval(timerInterval);
              loadingBox.style.display = 'none';
              badgeText.innerText = '🎉 AI 자동 채점 완료';
              document.getElementById('scoreValue').innerText = finalScore + '점';
              document.getElementById('scoreRate').innerText = '성취도: ' + ratePct + '% (' + finalScore + '/' + data.maxScore + ')';
              document.getElementById('feedbackText').innerText = finalFeedback;

              scoreBox.style.display = 'block';
              feedbackBox.style.display = 'block';
              closeBtn.style.display = 'block';
              autoMsg.style.display = 'block';

              confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
              setTimeout(function() { window.close(); }, 3500);
            } catch (err) {
              clearInterval(timerInterval);
              console.error('Grading error:', err);
              loadingBox.style.display = 'none';
              badgeText.innerText = '⚠️ 채점 실패';
              errorBox.style.display = 'block';
              errorBox.innerText = '오류 내용: ' + err.message;
              closeBtn.style.display = 'block';
              closeBtn.innerText = '창 닫기';
            }
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runGrading);
          } else {
            runGrading();
          }
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    return c.html(`
      <!DOCTYPE html>
      <html lang="ko">
      <head><meta charset="UTF-8"><title>채점 오류</title></head>
      <body style="background:#0f172a;color:#f87171;font-family:sans-serif;padding:40px;text-align:center;">
        <h2>⚠️ 시험 정보 조회 중 오류가 발생했습니다</h2>
        <p style="color:#cbd5e1;margin:16px 0;">${err.message}</p>
        <button style="background:#3b82f6;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;" onclick="window.close()">창 닫기</button>
      </body></html>
    `, 500);
  }
}

api.get('/auto-grade-exam', handleAutoGradeExam);
api.post('/auto-grade-exam', handleAutoGradeExam);

export default api;



