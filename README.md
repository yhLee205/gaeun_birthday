# 🎂 가은이 생일 축하 웹앱 — 케이크 쌓기 게임

모바일에서 열어보는 생일 축하 웹앱입니다.
`stack.io` 스타일로 케이크 칸을 한 칸씩 쌓아 **22층**을 채우면, 촛불 켜진
생일 케이크 엔딩이 나옵니다. 마이크에 **"후—"** 하고 입김을 불면 촛불이
꺼지고 손편지가 한 글자씩 타이핑돼요. (마이크가 안 되면 버튼을 꾹 눌러서 끌 수 있어요.)

순수 HTML / CSS / JS 로만 만들었고, 외부 의존성은 한글 Google Fonts 뿐입니다.

---

## 1. 로컬에서 실행하기

`config.js` 같은 파일을 `file://` 로 바로 열면 일부 브라우저에서 막힐 수 있어요.
간단한 로컬 서버로 여는 걸 추천합니다.

```bash
# 방법 A) Python 이 있으면 (이 폴더에서)
python -m http.server 8000
#  → 브라우저에서 http://localhost:8000 접속

# 방법 B) Node 가 있으면
npx serve .
```

> 📌 **마이크는 `http://localhost` 또는 `https://` 에서만 동작합니다.**
> (브라우저 보안 정책. 자세한 건 아래 4번 참고)

---

## 2. 내 맘대로 커스텀하기 (`js/config.js`)

수정할 값은 **전부 `js/config.js` 한 파일**에 모여 있습니다. 주석을 따라 바꾸면 돼요.

| 값 | 설명 |
|----|------|
| `name` | 받는 사람 이름. 타이틀에 "○○야/아" 로 표시 (받침 자동 처리) |
| `date` | 날짜 배지 텍스트 |
| `from` | "from. ___" 라인 |
| `target` | 쌓을 칸 수 (기본 22) |
| `photos` | 배경 사진 경로 배열. **비워두면 파스텔 배경**이 자동으로 나옴 |
| `messages` | 칸마다 뜨는 말풍선 메시지. 모자라면 기본 메시지로 자동 채움 |
| `letter` | 엔딩 손편지 (`\n` 으로 줄바꿈) |
| `letterSign` | 손편지 서명 |
| `cakeColors` | 칸 색 / 케이크 층 색 배열 |

### 사진 넣는 법
1. `img/` 폴더에 사진을 넣습니다. (예: `img/1.jpg`, `img/2.jpg`)
2. `config.js` 의 `photos` 배열에 경로를 적습니다:
   ```js
   photos: ["img/1.jpg", "img/2.jpg", "img/3.jpg"],
   ```
3. 칸을 떨어뜨릴 때마다 배경 사진이 한 장씩 바뀝니다.

---

## 3. GitHub Pages 로 배포하기

이 앱은 모든 경로가 **상대경로**라 GitHub Pages 에 그대로 올리면 됩니다.

1. GitHub 에 새 저장소를 만들고 이 폴더 전체를 push 합니다.
   ```bash
   git init
   git add .
   git commit -m "birthday app"
   git branch -M main
   git remote add origin https://github.com/<아이디>/<저장소>.git
   git push -u origin main
   ```
2. 저장소 **Settings → Pages** 로 이동합니다.
3. **Build and deployment → Source** 를 `Deploy from a branch` 로 두고
   브랜치를 `main` / 폴더를 `/ (root)` 로 선택, **Save**.
4. 잠시 뒤 `https://<아이디>.github.io/<저장소>/` 주소로 열립니다.

> 카카오톡 등으로 이 주소를 보내주면 가은이가 폰에서 바로 열어볼 수 있어요. 🎁

---

## 4. ⚠️ 마이크는 HTTPS 가 필요해요

촛불 끄기는 `getUserMedia` 로 마이크 입력을 받습니다. 브라우저 보안 정책상
마이크는 **`https://`** 또는 **`http://localhost`** 에서만 동작합니다.

- ✅ GitHub Pages 주소(`https://...github.io/...`) → 마이크 정상 동작
- ✅ `http://localhost:8000` → 정상 동작
- ❌ 파일 직접 열기(`file://...`) / 일반 `http://` 사설 IP → 마이크 막힘

마이크 권한을 거부하거나 지원이 안 되는 경우에도 **"꾹 눌러서 끄기" 버튼**으로
촛불을 끌 수 있으니 엔딩까지 항상 볼 수 있습니다.

---

## 폴더 구조

```
/index.html
/css/style.css
/js/config.js   ← 커스텀은 여기서
/js/main.js
/img/           ← 사진 넣는 곳
/README.md
```

## 접근성 / 호환

- 입력은 **화면 탭 + 스페이스바** 둘 다 지원
- `prefers-reduced-motion` 설정 시 과한 애니메이션을 줄임
- 버튼 키보드 포커스 / 폴백 처리 포함
- 모바일 세로 화면 우선, 데스크탑도 동작

🤍 happy birthday!
