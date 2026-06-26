# LayerBridge

LayerBridge는 PSD 파일을 브라우저에서 로컬로 분석하고, Figma 개발용 플러그인이 가져올 수 있는 payload를 만드는 정적 웹 앱입니다.

배포 URL: https://hwahyo-o.github.io/psd-converter/

## 핵심 전제

- PSD 파일은 서버로 업로드되지 않습니다.
- GitHub Pages에서 바로 실행되는 정적 앱입니다.
- 변환 기준은 편집성 우선입니다.
- 마스크, 복잡한 효과, 스마트 오브젝트처럼 Figma 네이티브 원형 보존이 어려운 레이어는 시각 일치를 위해 fallback 이미지/경고 리포트로 처리합니다.

## v1 지원 범위

- PSD v1, RGB, 8bit 파일을 우선 지원합니다.
- 그룹은 Figma frame 구조로 보존합니다.
- 텍스트 메타데이터가 있는 레이어는 Figma text node로 가져옵니다.
- opacity, visibility, bounds, blend mode 같은 기본 메타데이터를 payload에 포함합니다.
- 마스크, 고급 효과, 스마트 오브젝트, unsupported 레이어는 compatibility report에 표시합니다.

## 웹 앱 사용 방법

1. https://hwahyo-o.github.io/psd-converter/ 에 접속합니다.
2. PSD 파일을 드롭하거나 선택합니다.
3. `Analyze PSD`를 클릭합니다.
4. 레이어 트리, 선택 레이어 mapping, warnings를 확인합니다.
5. `Build Figma Payload` 또는 `Download Payload`를 클릭합니다.
6. 다운로드된 zip을 압축 해제합니다.

payload 구성:

- `manifest.json`: payload 메타데이터
- `document.json`: Figma plugin이 읽는 문서/레이어/asset 구조
- `report.json`: compatibility summary와 warnings
- `assets/`: fallback PNG asset이 있을 때 포함

## Figma 개발용 플러그인 사용 방법

1. Figma desktop을 실행합니다.
2. `Plugins > Development > Import plugin from manifest...`를 선택합니다.
3. 이 저장소의 `figma-plugin/manifest.json`을 선택합니다.
4. `LayerBridge Importer`를 실행합니다.
5. 웹 앱에서 받은 payload zip을 압축 해제한 뒤 `document.json`을 선택합니다.
6. 현재 Figma page에 LayerBridge frame이 생성됩니다.

## 실제 PSD 검증 체크리스트

- Photoshop의 레이어 순서와 group 구조가 유사하게 유지되는지 확인합니다.
- 텍스트 레이어가 가능한 경우 편집 가능한 text node로 생성되는지 확인합니다.
- 마스크/스마트 오브젝트 레이어가 warning과 fallback으로 표시되는지 확인합니다.
- `report.json`의 native/partial/fallback/unsupported 수치가 UI 및 Figma import 결과와 일치하는지 확인합니다.
- 브라우저 개발자 도구 Network 탭에서 PSD 파일이 외부로 업로드되지 않는지 확인합니다.

## 개발 메모

현재 root `index.html`은 GitHub Pages root 배포에서도 바로 실행되도록 CDN 기반 정적 앱으로 구성되어 있습니다. 저장소에는 Figma development plugin도 함께 포함되어 있습니다.

로컬에서 간단히 확인하려면 `index.html`을 브라우저에서 열거나 정적 서버로 실행하면 됩니다.
