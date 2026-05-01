import toast from "react-hot-toast";
import styled from "styled-components";

const Duration = 1200;

const customToast = {
  success: (message, duration = Duration) => {
    toast.dismiss(); // 기존 토스트 제거
    toast.success(message, { duration });
  },
  error: (message, duration = Duration) => {
    toast.dismiss(); // 기존 토스트 제거
    toast.error(message, { duration });
  },
  message: (message, duration = Duration) => {
    toast.dismiss(); // 기존 토스트 제거
    toast(message, { duration });
  },
  confirm: (
    message,
    onConfirm,
    onCancel,
    confirmText = "네",
    cancelText = "아니요",
    type = "error" // 기본값을 "error"로 설정
  ) => {
    toast.dismiss(); // 기존 토스트 제거

    // 선택한 타입에 따라 toast.success() 또는 toast.error() 사용
    const toastType = type === "success" ? toast.success : toast.error;

    toastType(
      (t) => (
        <S.ConfirmToast>
          <p>{message}</p>
          <div>
            <button
              onClick={async () => {
                try {
                  await onConfirm();
                } finally {
                  // onConfirm이 throw해도 반드시 toast를 닫는다.
                  // duration: Infinity이므로 finally 없이는 toast가 영구 잔류한다.
                  toast.dismiss(t.id);
                }
              }}
            >
              {confirmText}
            </button>
            <button
              type="button"
              onClick={() => {
                if (onCancel) onCancel();
                toast.dismiss(t.id);
              }}
              style={{ backgroundColor: "lightgray" }}
            >
              {cancelText}
            </button>
          </div>
        </S.ConfirmToast>
      ),
      { duration: Infinity }
    );
  },
};

export default customToast;

const S = {
  ConfirmToast: styled.div`
    p {
      text-align: center;
      margin-left: 10px;
      word-break: keep-all;
    }

    div {
      width: 100%;
      display: flex;
      justify-content: center;
    }

    button {
      margin: 8px 10px 0px 0px;
      padding: 4px 12px;
      background-color: #f0f0f0;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }
  `,
};
