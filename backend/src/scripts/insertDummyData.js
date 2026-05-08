const { File, Semina, Feature } = require("../models");

const insertDummyData = async () => {
  try {
    console.log("[TEST] 더미 데이터 삽입 중");

    
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

    console.log("[TEST] 더미 데이터 삽입 완료");
  } catch (error) {
    console.error("[ERROR] 더미 데이터 삽입 실패:", error);
  }
};

module.exports = insertDummyData;