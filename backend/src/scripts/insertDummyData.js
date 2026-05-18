const { File, Semina, Feature } = require("../models");

const insertDummyData = async () => {
  try {
    console.log("[TEST] 더미 데이터 삽입 중");

    const existingCount = await Semina.countDocuments();

    if (existingCount > 0) {
      console.log("[TEST] Semina & File 더미 데이터가 이미 존재함 (삽입 안 함)");
    } else{
        const seminas = await Semina.insertMany([
        {
          speaker: "이제민 | 전자전기컴퓨터공학부 | 2020440102",
          topic: "백엔드 개발의 핵심 원리",
          detail:
            "NestJS와 Express의 차이점을 비교하고, 효율적인 서버 아키텍처를 설계하는 방법을 설명합니다.",
          resources: "https://example.com",
          presentation_date: new Date("2025-02-20"),
        },
        {
          speaker: "이예나 | 전자전기컴퓨터공학부 | 2020440000",
          topic: "모던 프론트엔드 트렌드",
          detail:
            "React 19의 주요 변화와 최신 웹 기술(WebAssembly, Web Components)을 활용한 최적화 기법을 다룹니다.",
          resources: "https://example.com",
          presentation_date: new Date("2025-02-22"),
        },
        {
          speaker: "김예영 | 전자전기컴퓨터공학부 | 2020440001",
          topic: "클라우드 컴퓨팅과 DevOps",
          detail:
            "AWS, GCP, Azure 비교 및 CI/CD 자동화 파이프라인 구축에 대한 실제 사례를 공유합니다.",
          presentation_date: new Date("2025-02-23"),
        },
        {
          speaker: "하진혁 | 전자전기컴퓨터공학부 | 2020440002",
          topic: "데이터베이스 성능 최적화",
          detail:
            "SQL 인덱싱 전략과 NoSQL 데이터 모델링 기법을 비교하여 최적의 데이터베이스 설계를 논의합니다.",
          presentation_date: new Date("2025-02-24"),
        },
        {
          speaker: "차준섭 | 전자전기컴퓨터공학부 | 2020440003",
          topic: "웹 보안과 해킹 대응",
          detail:
            "XSS, CSRF, SQL Injection 같은 보안 취약점을 알아보고, 실제 웹 서비스에서 어떻게 방어할 수 있는지 설명합니다.",
          resources: "https://example.com",
          presentation_date: new Date("2025-02-25"),
        },
        {
          speaker: "정민욱 | 전자전기컴퓨터공학부 | 2020440004",
          topic: "머신러닝을 활용한 웹 애플리케이션",
          detail:
            "TensorFlow.js를 사용하여 웹 브라우저에서 직접 실행할 수 있는 AI 모델을 구축하는 방법을 소개합니다.",
          presentation_date: new Date("2025-02-26"),
        },
        {
          speaker: "정승주 | 전자전기컴퓨터공학부 | 2020440005",
          topic: "인터랙티브 UI/UX 디자인",
          detail:
            "Framer Motion, Tailwind CSS, Three.js 등을 활용하여 사용자 경험을 극대화하는 인터랙티브 웹사이트를 만드는 방법을 다룹니다.",
          resources: "https://example.com",
          presentation_date: new Date("2025-02-27"),
        },
      ]);

      await File.insertMany([
        {
          file_name: "image1.jpg",
          semina_id: seminas[0]._id,
        },
        {
          file_name: "file1.pdf",
          semina_id: seminas[0]._id,
        },
        {
          file_name: "image2.png",
          semina_id: seminas[1]._id,
        },
        {
          file_name: "file2.pdf",
          semina_id: seminas[1]._id,
        },
        {
          file_name: "image3.jpg",
          semina_id: seminas[2]._id,
        },
        {
          file_name: "file3.pdf",
          semina_id: seminas[2]._id,
        },
        {
          file_name: "image4.png",
          semina_id: seminas[3]._id,
        },
        {
          file_name: "file4.pdf",
          semina_id: seminas[3]._id,
        },
        {
          file_name: "image5.jpg",
          semina_id: seminas[4]._id,
        },
        {
          file_name: "file5.pdf",
          semina_id: seminas[4]._id,
        },
        {
          file_name: "image6.png",
          semina_id: seminas[5]._id,
        },
        {
          file_name: "file6.pdf",
          semina_id: seminas[5]._id,
        },
        {
          file_name: "image7.jpg",
          semina_id: seminas[6]._id,
        },
        {
          file_name: "file7.pdf",
          semina_id: seminas[6]._id,
        },
      ]);
      console.log("[TEST] 세미나 & File 더미 데이터 삽입 완료");
    }

    await Feature.updateOne(
      { feature_name: "recruit" },
      {
        $setOnInsert: {
          feature_name: "recruit",
          is_enabled: true,
        },
      },
      { upsert: true }
    );

    console.log("[TEST] feature 더미 데이터 삽입 완료");

    console.log("[TEST] 모든 더미 데이터 삽입 완료");
  } catch (error) {
    console.error("[ERROR] 더미 데이터 삽입 실패:", error);
  }
};

module.exports = insertDummyData;