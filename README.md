# 모험가 명부 (Adventurer's Ledger)

RisuAI 플러그인. 발더스 게이트 3의 캐릭터 생성 화면처럼 D&D 5판 규칙으로 모험가를 만들고, 그 결과를 RisuAI 페르소나로 저장한다.

## 설치

1. [`dist/adventurers-ledger.js`](dist/adventurers-ledger.js) 파일을 받는다.
2. RisuAI → 설정 → 플러그인 → 플러그인 가져오기에서 그 파일을 고른다.
3. 왼쪽 메뉴(햄버거 메뉴)의 **모험가 명부**로 연다.

새 버전이 올라오면 플러그인 목록에 업데이트 표시가 뜬다.

## 할 수 있는 것

- 종족 11개(하위 종족 31개), 직업 12개(하위 직업 58개), 배경 13개, 특기 43개, 주문 350여 개 중에서 골라 1~20레벨 캐릭터 만들기
- 종족·배경 직접 만들기
- 포인트 구매 / 표준 배열 / 직접 입력, 종족 보너스 자유 배치
- 레벨마다 생기는 선택(하위 직업, 능력치 향상, 특기, 영창, 기교 등)을 차례로 고르기
- 외형·성격 예시 칩, 배경별 성격 무작위 뽑기
- 영어 페르소나 글 생성(판정 모드 켜면 수치까지), 리스 모델로 한국어 설정 번역
- 페르소나 저장이 안 될 때 직접 붙여 넣을 영어·한국어 글 보기

## 개발

```bash
npm install
npm run build        # dist/adventurers-ledger.js
npm run validate     # 데이터 참조 검사
node tools/smoke-test.mjs   # 모든 종족·직업·하위 직업 조합 계산 검사
```

`preview/index.html`을 브라우저로 열면 리스 없이 화면을 볼 수 있다(저장은 메모리에만 된다).

데이터 형식은 [`docs/data-format.md`](docs/data-format.md)를 본다.

## 출처

[CREDITS.md](CREDITS.md) 참고. D&D 규칙 일부는 SRD 5.1(CC BY 4.0)에서 가져왔다. 비공식 팬 제작물이다.
