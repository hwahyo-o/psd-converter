# PSD 변환기 - LayerBridge

배포 URL: https://hwahyo-o.github.io/psd-converter/

LayerBridge는 PSD 파일을 브라우저에서 로컬로 분석하고, Figma 개발용 플러그인이 가져올 수 있는 payload를 생성하는 정적 웹 프로그램입니다. PSD 파일은 외부 서버로 업로드하지 않고 브라우저 메모리 안에서 처리합니다.

## 개선된 내용

- 전체 웹 UI를 한국어 기준으로 정리했습니다.
- PSD 분석 완료 또는 payload 생성 완료 시 모달창이 표시됩니다.
- 업로드한 PSD의 실제 사이즈, Depth, 총 Layers를 화면과 리포트에 표시합니다.
- 미리보기는 PSD composite canvas가 있으면 실제 이미지로 표시하고, 없으면 레이어별 canvas를 브라우저에서 합성해 더 실제 PSD에 가깝게 표시합니다.
- 텍스트 레이어 감지를 개선해 `ag-psd`의 `text.value`, `text.text`, style metadata를 폭넓게 읽습니다.
- Photoshop 블렌드 모드 이름을 정규화해 Figma 플러그인에서 `multiply`, `screen`, `color dodge`, `hard light` 등 대표 모드를 더 안정적으로 매핑합니다.
- 도형 레이어의 fill/stroke와 대표 효과(drop shadow, stroke, overlay metadata)를 payload에 포함하고, Figma 플러그인에서 가능한 속성으로 적용합니다.
- 기존의 fallback/unsupported 중심 분류를 줄이고 `네이티브`, `부분 보존`, `이미지 보존`, `검토 필요`로 구분합니다.
- Figma 개발용 플러그인은 `document.json`을 읽어 현재 Figma 페이지에 프레임과 레이어 노드를 생성합니다.

## 현재 저장소 구성

배포와 플러그인 실행에 필요한 파일만 유지합니다.

- `index.html`: GitHub Pages에서 바로 실행되는 웹 앱
- `README.md`: 사용 설명
- `figma-plugin/manifest.json`: Figma 개발용 플러그인 manifest
- `figma-plugin/code.js`: Figma Plugin API importer
- `figma-plugin/ui.html`: 플러그인 UI

## 웹 앱 사용 방법

1. https://hwahyo-o.github.io/psd-converter/ 에 접속합니다.
2. PSD 파일을 선택하거나 드롭합니다.
3. `PSD 분석`을 클릭합니다.
4. 분석 완료 모달과 함께 문서 정보, 레이어 목록, 변환 가능성을 확인합니다.
5. `Figma payload zip 생성` 또는 `document.json 다운로드`를 클릭합니다.
6. zip을 받은 경우 압축을 해제합니다.

payload 구성:

- `manifest.json`: payload 메타데이터
- `document.json`: Figma 플러그인이 읽는 문서/레이어/asset 구조
- `report.json`: 변환 요약과 경고/안내
- `assets/`: 레이어별 이미지 asset이 추출된 경우 포함

## Figma 플러그인 사용 방법

1. Figma desktop을 실행합니다.
2. `Plugins > Development > Import plugin from manifest...`를 선택합니다.
3. 이 저장소의 `figma-plugin/manifest.json`을 선택합니다.
4. `PSD 변환기` 플러그인을 실행합니다.
5. 웹 앱에서 받은 payload zip을 압축 해제한 뒤 `document.json`을 선택하거나, 웹 앱에서 바로 받은 `document.json`을 선택합니다.
6. `Figma에 가져오기`를 클릭하면 현재 페이지에 LayerBridge 프레임이 생성됩니다.

## 현실적인 한계

PSD와 Figma는 파일 모델이 다르기 때문에 모든 Photoshop 기능을 100% 편집 가능한 Figma 객체로 변환할 수는 없습니다. LayerBridge는 가능한 항목은 편집 가능한 노드로 만들고, 스마트 오브젝트/픽셀 레이어/마스크 등은 이미지 보존 방식으로 시각 결과를 유지하는 방향으로 동작합니다.