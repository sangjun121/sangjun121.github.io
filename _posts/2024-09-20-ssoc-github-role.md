---
layout: post
title: 1. 동아리 모집 프로세스 관리 서비스 SSOC의 협업 규칙(1편 Github Repository 관리) 
subtitle: 우리 팀 SSOC는 깃허브 레포지토리를 어떻게 관리하는가
author: 조상준
categories: SSOC 온보딩
banner:
  image: ../assets/images/ssocgithubrole/ssocgithubrole.png
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold;"
  subheading_style: "color: black"
tags: SSOC 온보딩
comments: true
---

### 서론
아래 문서는 현재 SSOC 프로젝트 팀원간의 Github Repository 관리 규칙을 명세한 온보딩 문서이다.    
팀 내부 동기화를 위해 작성한 문서로 추후 개발 협업 간에 사용 가능하도록 공유하고자 한다.

### 0. 개요

- 해당 문서는 SSOC 서비스 개발 프로젝트에 참여한 모든 개발자들이 따라야 하는 규칙과 개발 절차를 명세한다.
- 아래 순서로 이슈 발행부터 PR 생성, 코드리뷰, 리뷰어의 Approve후 Merge까지의 절차를 담고 있다.

## 작업 수행 순서
### 1. 이슈 발행하기

- 작업을 수행하기 전, 한 가지 단위의 Task(기능, 리펙토링, 버그, 등)를 Issue로 발행하여 관리한다.

1. Issue → New Issue 선택
    ![test.png](/assets/images/ssocgithubrole/ssocgithubrole001.png)
    
2. 작업 종류에 맞게 이슈 템플릿 선택
    ![test.png](/assets/images/ssocgithubrole/ssocgithubrole002.png)
    

3. 이슈 작성하기
    ![test.png](/assets/images/ssocgithubrole/ssocgithubrole003.png)     

<br>
### 🧑‍🏫 오른쪽 사이드바에 대한 간단 설명
1. 작업 배정자(Assignees)를 설정한다.
    - 보통 본인 작업에 대한 Issue를 발행하기 때문에, 해당 이슈에 대한 작업자는 본인이 된다. 다른 사람을 할당해도 무방하다.
<br>
2. 라벨
    - 기본적으로, github 봇에 의해, 해당 템플릿에 해당하는 라벨이 달린다.
    (예, 기능 구현 이슈 템플릿을 골랐다면, ⭐️feature라벨이 달린다.)
    - 이 외로 반드시, 🌍ALL/ 💻BE/ 🚀FE 중 하나를 추가해주어야 한다.
<br>
3. 프로젝트
    - Github 프로젝트는 현재 수행중이거나 완료 된 작업에 대해 칸반 보드 형태로 볼수 있다.
    - 2024 Github Project에 해당 이슈를 담으면 된다.
    - 현재, Issue와 PR생성시에 자동으로 Github Project의 TODO State로 설정된다.
<br>
4. 마일스톤
    - 마일스톤은 쉽게 설명하면, 목표기간동안 수행한 작업들의 집합을 의미한다. 그래서 현재 MVP 구현이 목표이므로 현재는 1차 구현 Milestone에 담으면 된다.

### 2. 이슈에 대한 브랜치 생성 (현재 자동화 설정 [create-issue-branch](https://github.com/robvanderleek/create-issue-branch) 사용)

- 현재 Github Action으로 issue에 대한 작업자가 할당되면, 해당 이슈에 대한 브랜치와, 브랜치에 대한 Draft PR이 자동 생성된다. 해당 과정에 대해 아래 상세히 기술해 두었다.
- Assignee를 할당하면 아래와 같은 comment가 이슈에 달린다.

![test.png](/assets/images/ssocgithubrole/ssocgithubrole004.png)

- 일정 시간이 흐르면, Issue 밑에 다음과 같이 4줄이 추가 된다.   
    - 1번줄 → 이슈에 대한 담당자 할당이 되었다는 의미 (이때, githun action이 실행된다.)

    - 2번줄 → 해당 issue에 대한 브랜치 생성   
        - 브랜치는 develop 밑에 할당되며, 브랜치 명은, 접두사로 해당 작업의 종류(위에서는 refactor), 이름은 이슈번호로 생성된다.

    - 3번줄 → 해당 이슈가 연결된(link)된 Draft PR이 자동 생성됨
        - Draft PR이란? → 작업 중인 코드가 아직 리뷰를 받을 준비가 되어있지 않으며, 계속 작업이 이뤄지는 상태를 의미한다.

    - 4번줄 →  PR에서 해당 이슈번호를 언급했다는 뜻. (해당 자동화에서는 PR 본문에 closed #23 이라는 명령어가 추가된다.)
<br>
- 아직, 3번과 4번에 대해 직관적으로 와닿지 않을 수 있다. 아래의 PR 생성 파트를 읽고 다시 보자.

### 3. 작업하기

![test.png](/assets/images/ssocgithubrole/ssocgithubrole005.png)

- 이제 브랜치를 확인하면, refactor/issue-23 브랜치가 생성됨.
- 또한 PR과 연결됨을 확인할 수 있다. (위 사진에서 해당 PR의 번호는 24번 이다.)
- 이제 해당 레포지토리를 클론 받고, 작업을 진행하자.
- 레포지토리 클론 받기
- 인텔리제이에서 아래 명령어 실행

```java
git fetch origin
git checkout "브랜치명"
```

- 해당 브랜치에 commit 찍고 작업하면 된다.

### 4. PR 작성하기

- 작업이 끝났다면, 이제 이전에 생성된 Draft PR을 살펴보자. 아까 issue생성시, Assignees를 배정했을 때, 생긴 Draft PR이다.
- PR의 Target 브랜치가 develop인지 다시 한번 확인하자.

![test.png](/assets/images/ssocgithubrole/ssocgithubrole006.png)

- 현재, 자동화 기능으로 PR이 만들어질 때, 오른쪽의 Assignee와 Label이 copy된 것을 확인할 수 있다.
- PR화면에서 설정할 것들은 다음과 같다.
    1. Reviewer 설정
        - 현재는 reviewer을 수동으로 설정하게 되어 있다. 리뷰를 진행할 팀원을 설정한다. 리뷰어로 선정되면 디스코드 통해 알림을 받게 된다.
        - 이후, 규모가 커질 경우, 리뷰어 자동 랜덤 배정 기능도 도입 예정
    
    2. Project 상태 review로 설정
        - 이슈와 마찬가지로, PR도 Github Project에 올라가게 된다. 이때 상태를 review로 설정한다.
    
    3. 마일스톤에 PR 추가하기
        - 이슈와 마찬가지로, PR도 동일한 마일 스톤에 추가한다.

    4. PR Templete을 이용하여, PR본문 작성하기
        1. 자동 생성된 PR의 본문에는, closes #이슈번호 만 작성되어 있다.
        2. 작업을 마치고 PR을 작성할 때 아래 템플릿에 맞게 작성한다.
            
            ```java
            ## 📌 관련 이슈
            PR과 연관된 이슈의 번호를 작성해주세요.
            PR 머지 시 close 되어야 하는 이슈의 경우 이슈 번호 앞에 `closed` 키워드를 붙여주세요.  
            ex) `closed #2`
            
            ## 🛠️ 작업 내용
            PR에서 작업한 주요 내용을 적어주세요.
            - [ ] 작업1
            - [ ] 작업2
            
            ## 🎯 리뷰 포인트
            리뷰시 중점적으로 봐주었으면 좋을 부분을 적어주세요.  
            없다면 적지 않아도 됩니다.  
            
            - 리뷰 포인트
            
            ## ⏳ 작업 시간
            추정 시간:   
            실제 시간:   
            이유: 차이가 많이 난다면 이유도 같이 적어주세요 :)
            ```
            
        - 예시
        ![image.png](/assets/images/ssocgithubrole/ssocgithubrole010.jpeg)
        
        - **closed issue번호** 작성하는 것 잊지 말자. 해당 코드는 PR이 Merge 되었을 때, 자동으로 Issue를 닫을 수 있도록 도와준다.
        ![test.png](/assets/images/ssocgithubrole/ssocgithubrole007.png)
            
    
    3. Draft PR을 PR로 변경하기
        - 리뷰를 받을 준비가 되었다면, Draft PR를 PR로 수정한다.
            ![test.png](/assets/images/ssocgithubrole/ssocgithubrole008.png)
        <br>
        - 만약, 다시 Draft PR로 수정하고 싶으면, 오른쪽 바에서 Convert to Draft를 클릭하면 된다.
            ![test.png](/assets/images/ssocgithubrole/ssocgithubrole009.png)
        

### 5. Merge하기

- 코드리뷰를 받고, 1명이상의 Approve를 받아야, Merge할 수 있다.
    - Merge는 반드시 팀원과 협의한 이후에 실행하자
- merge 전엔 반드시 target 브랜치가 적절한지 확인하자 (develop에 보내야 한다 main에 보내지 말자)
- Merge를 하고 나서 수행해야하는 작업은 다음과 같다.
    - Close PR
    - Close Issue
    - 해당 브랜치 삭제 (현재 확인 결과, 자동 삭제 안됨. 따라서 merge하고 수동으로 Delete Branch 버튼 누르기)
    - Github Project에서 issue와 PR 모두 Done State로 이동
- 위 4가지 작업은 모두 자동화 설정을 해둔 상태이다.

### 6. 주의사항

- 이슈는 삭제할 수 있다. (close는 삭제가 아님. Issue에서 Delete Issue 버튼 클릭)
- 단, PR은 삭제할려면, Github 고객센터에 문의해야 한다. 함부로 생성하지 말 것.
