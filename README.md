# PSD Converter — Adobe Illustrator & Figma

PSD 파일의 **모든 레이어와 그룹 구조를 유지한 채** SVG(Illustrator)와 Figma로 변환하는 웹 앱입니다.

**100% 브라우저에서 처리됩니다.** 파일이 서버로 전송되지 않으므로 GitHub Pages에 정적 호스팅 가능하고, 보안에도 더 유리합니다.

---

## 🚀 GitHub Pages로 배포하기 (URL 하나로 사용)

이 가이드대로 따라 하면 약 **5분 안에** 본인의 영구적인 URL이 생깁니다.
예: `https://본인아이디.github.io/psd-converter`

### 사전 준비
- GitHub 계정 ([github.com](https://github.com) 가입, 무료)

---

### 1단계: GitHub에 코드 올리기 (3분)

#### 방법 A: 웹 인터페이스 (가장 쉬움, 추천)

1. [github.com/new](https://github.com/new) 접속
2. **Repository name**에 `psd-converter` 입력
3. **Public** 선택 (GitHub Pages 무료 플랜은 Public만 가능)
4. **"Create repository"** 클릭
5. 다음 화면에서 회색 글씨 **"uploading an existing file"** 링크 클릭
6. ZIP의 압축을 풀고, **그 안에 있는 모든 파일/폴더**를 드래그해서 업로드
   - `index.html`, `converter.js`, `figma-plugin/`, `README.md`, `.gitignore`
   - ⚠️ `psd-converter` 폴더를 통째로가 아니라, **그 내용물**을 업로드
7. 아래쪽 녹색 **"Commit changes"** 버튼 클릭

#### 방법 B: Git 명령어

```bash
cd psd-converter
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/본인아이디/psd-converter.git
git push -u origin main
```

---

### 2단계: GitHub Pages 활성화 (1분)

1. 본인 저장소 페이지 상단의 **"Settings"** 클릭
2. 좌측 메뉴에서 **"Pages"** 클릭
3. **"Source"** 섹션에서:
   - Branch: **main** 선택
   - Folder: **/ (root)** 선택
4. **"Save"** 버튼 클릭
5. 페이지 상단에 잠시 후 다음 메시지가 나타남:
   > ✅ Your site is live at https://본인아이디.github.io/psd-converter/

   ⏱ 처음에는 1~2분 정도 빌드 시간이 필요. 새로고침해서 확인.

---

### 3단계: 사용하기

#### 웹앱
브라우저에서 본인의 GitHub Pages URL 접속:
```
https://본인아이디.github.io/psd-converter/
```

PSD 파일을 드래그하면 본인 브라우저에서 즉시 변환됩니다.

#### Figma 플러그인 설치
1. Figma 데스크탑 앱 실행
2. 상단 메뉴 → **Plugins → Development → Import plugin from manifest...**
3. ZIP의 `figma-plugin/manifest.json` 파일 선택
4. 좌측 메뉴에서 **PSD Importer** 플러그인 실행
5. 웹앱에서 받은 JSON 파일 업로드 → "Figma에 가져오기" 클릭

---

## 🔄 코드 수정 시 자동 재배포

GitHub 저장소에 변경사항을 commit하면 GitHub Pages가 자동으로 재배포합니다. 별도 작업 불필요.

---

## ⚙ 작동 방식

```
[브라우저]
  ↓ PSD 파일 (드래그앤드롭)
ag-psd 라이브러리 (CDN에서 로드)
  ↓ 레이어 트리 파싱
converter.js
  ↓ ↓
SVG 생성  Figma JSON 생성
  ↓        ↓
다운로드   Figma 플러그인에 업로드
```

**핵심:** 모든 처리가 브라우저에서 이루어지므로 서버가 필요 없고, PSD 파일이 외부로 전송되지 않습니다.

---

## 지원 항목

| 레이어 타입 | SVG (Illustrator) | Figma |
|---|---|---|
| 그룹/폴더 구조 | ✅ `<g>` 중첩 | ✅ Frame 컨테이너 |
| 텍스트 레이어 | ✅ `<text>` 편집 가능 | ✅ Text 노드 |
| 벡터 셰이프/패스 | ✅ `<path>` | ✅ Vector |
| 래스터/픽셀 레이어 | ✅ `<image>` base64 | ✅ Rectangle + 이미지 |
| 스마트 오브젝트 | ✅ 렌더링 임베드 | ✅ 렌더링 임베드 |
| 조정 레이어 | ✅ SVG `<filter>` 근사 | ✅ 메타데이터 보존 |
| 드롭섀도/글로우 | ✅ SVG 필터 | ✅ Figma 이펙트 |
| 스트로크 이펙트 | ✅ SVG stroke | ✅ Figma stroke |
| 블렌드 모드 | ✅ CSS mix-blend-mode | ✅ Figma blendMode |
| 레이어 불투명도/가시성 | ✅ opacity / visibility | ✅ opacity / visible |

---

## ⚠️ 제한 사항

브라우저에서만 처리하므로 다음 한계가 있습니다:

- **대용량 PSD**: 100MB 이상 파일은 브라우저 메모리 한계로 처리가 느려지거나 실패할 수 있습니다.
- **CMYK / Lab / Duotone**: ag-psd 라이브러리가 RGB만 지원. CMYK 파일은 자동으로 RGB로 변환됨.
- **복잡한 조정 레이어**: SVG/Figma 표현 한계로 근사 변환만 가능.
- **링크된 스마트 오브젝트**: 임베드된 것만 지원.

---

## 🛠 로컬에서 실행

배포 없이 본인 컴퓨터에서만 쓰려면:

```bash
# 간단: index.html을 더블클릭으로 브라우저에서 열기
# 또는 간단한 로컬 서버:
cd psd-converter
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

---

## ⚙ 기술 스택

- **PSD 파싱**: [ag-psd](https://github.com/Agamnentzar/ag-psd) (CDN 로드)
- **변환 로직**: 바닐라 JavaScript (`converter.js`)
- **UI**: 바닐라 HTML/CSS/JS (`index.html`)
- **Figma 플러그인**: Figma Plugin API
- **호스팅**: GitHub Pages (정적 호스팅)

---

## ❓ 문제 해결

**GitHub Pages URL이 404를 보임**
- Settings → Pages에서 Source가 main / (root)로 설정됐는지 확인
- 처음 활성화 후 1~2분 정도 빌드 시간 필요
- `index.html`이 저장소 최상위에 있는지 확인

**페이지는 뜨는데 PSD 변환이 안 됨**
- 브라우저 콘솔(F12)에서 빨간 에러 메시지 확인
- 인터넷 연결 확인 (ag-psd 라이브러리가 CDN에서 로드되어야 함)
- 브라우저 새로고침 (Ctrl/Cmd + Shift + R)

**Figma 플러그인 에러**
- 웹앱에서 받은 **JSON 파일**을 업로드했는지 확인 (PSD가 아님)
- Figma **데스크탑 앱**에서만 동작 (브라우저 Figma는 개발 플러그인 미지원)

**큰 PSD에서 브라우저가 멈춤**
- 브라우저 메모리 한계 도달. 더 작은 PSD로 분할하거나 다른 컴퓨터에서 시도
