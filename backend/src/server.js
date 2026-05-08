const path = require("path");
const app = require("./app");
const { connectDB } = require("./models");
const insertDummyData = require("./scripts/insertDummyData");
const PORT = Number(process.env.PORT) || 3001;

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
//현재 실행된 파일의 경로에서 한단계 위로 올라가서 찾는 코드
//예: backoffice/backend/.env 파일을 읽어라


async function startServer() {
  try {
    await connectDB();
    console.log("[LOG] MongoDB 연결 성공");

    app.listen(PORT, () => {
      console.log(`PORT: ${PORT}`);
      console.log(`swagger: http://localhost:${PORT}/api-docs`);
      console.log(`server: http://localhost:${PORT}`);

    });
  } catch (err) {
    console.error("DB 연결 실패:", err);
    process.exit(1);
  }
}

startServer();