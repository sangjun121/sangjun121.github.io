---
layout: post
title: "검증은 어떻게 진행할 것인가 1편"
subtitle: "1편: 검증 종류와 레이어별 검증 책임 분리"
author: 조상준
categories: Spring Validation
lang: ko
banner:
  image: ../assets/images/validation/validation00101
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold;"
  subheading_style: "color: gray"
tags: Spring Validation
comments: true
sidebar: []
english_version: 
---
> 📖 **English Version Available**: [Read this post in English]()
## 현재 상황

현재 각 도메인 모듈은 팀원 별로 개별적으로 구현되어 있으며, 그 과정에서 **검증 로직이 일관성 없이 다양한 레이어에 흩어져 있는 문제가 보였다. 이에 따라 다음과 같은 문제점이 발견되었다.**

- 검증 로직의 누락 및 중복
- 검증 책임이 도메인 별로 다른 레이어에 위치하고 있음
- 검증 책임이 불분명하여 유지보수가 어려움

이런 문제를 해결하기 위해, **요청 흐름을 초점으로 반드시 필요한 검증이 어떤 종류가 있는지 정리하고** **각 검증을 어느 레이어, 어떤 객체에서 처리할지 명확한 기준을 세우고자 한다.**

이를 통해 팀 내 검증 방식의 싱크를 맞추고, 통일된 코드를 작성하고자 한다.

## 검증 종류에 대해 살펴보자.

기본적으로 필요한 검증로직을 4가지로 분리하자면 다음과 같다.

### 1. 형식(Form), 제약(Constraint) 검증

- 정의: 입력값의 형식이나 자료형이 유효한지, 값의 범위, 개수, 중복 여부 등 기본적인 조건 검증
- 예시 케이스: 이메일 형식 확인, 전화번호가 숫자인지, 길이가 맞는지,
나이가 0세 이상, 120세 이하인지, DB의 Description 필드의 길이가 500자가 넘어가지 않는지
- 수단: @Valid, @Pattern, @NotBlank, @NotNull, DB 테이블의 경우 필드 제약
- 위치: Request Dto, Controller, Entity

### 2. 비즈니스 규칙(Business Rule), 상태(State) 검증

- 정의: 도메인 내부 규칙이나 객체의 유효한 상태를 보장하기 위한 검증
- 예시 케이스: 마감일이 지난 지원서는 수정할 수 없음.
한 지원자에 대해 관리자는 동일 평가를 생성할 수 없음.
관리자는 동아리 내부에 중복된 권한을 가질 수 없음.
(상태검증 예시:) Expired된 공고에 한에서는 관리자만 조회할 수 있음.
(상태검증 예시:) 로그인한 사용자의 객체인지 확인.
- 수단: 조건문 기반의 검증 및 exception 발생 -> ExceptionHandler에서 예외 응답 반환
- 위치: Domain/Service (도메인 객체 내부에서 수행하는 것이 원칙이나,
필요한 경우 Service 로직에 구현될 수 있다.)

### 3. 외부 의존성(External Dependency) 기반 검증

- 정의: DB, 외부 API, 파일, 외부 도메인 등 외부 시스템과 연동된 유효성 검증
- 예시 케이스: Refresh Token이 유효한지 확인하기 위해, RefreshToken 테이블을 조회하여 검증.
동아리 내부 권한을 확인하기 위해, ClubRole 테이블을 조회하여 검증.
회원가입 시 이미 존재하는 이메일인지 검증.
- 수단: DB 조회
- 위치: Service

### 4. 권한 검증

- 정의: 현재 요청을 보낸 사용자가 인증되었는지, (즉, 로그인 되었는지) 인가되었는지
(즉, 적절한 권한을 가지고 있는지)를 검증
- 예시 케이스: 로그인 되지 않은 사용자는 /recuritment Path에 접근하지 못함. (인증 실패)
동아리 Member는 동아리 공고를 생성할 수 없음.(Owner만 가능) (인가 실패)
- 수단: Security Filter, AOP(Custom Aspect)로 인가 검증로직 커스텀
- 위치: Security Filter Exception EntryPoint(인증 예외의 경우),
AOP로 검증 후 -> @ControllerAdvice에서 예외응답 생성(인가 예외의 경우)

여기서 3번과 4번은 기능 자체가 검증의 역할을 수행하는 구조이며 4번의 인증/인가의 검증의 경우, SecurityFilter와 AOP를 통해 관리되고 있다.

따라서 본 문서에서는 실제 코드 작성 시 고려해야 할 1번과 2번 검증에 초점을 맞추어 명세하였다.

## 프로젝트 서버 아키텍처 흐름 살펴보기

아래의 설명을 쉽게 이해할 수 있도록, 서버 아키텍처 내부의 요청의 흐름을 정리해 보았다.
![test.png](/assets/images/validation/validation00103.png)
- 파란색 화살표: 요청 진입 흐름
- 주황색 화살표: 응답 반환 흐름
- 빨간색 화살표: 외부 도메인 참조 흐름

아래의 설명이 다소 복잡하게 느껴진다면 위의 그림을 참조하길 바란다. 해당 다이어그램이 글의 내용을 이해하는데 도움이 되길 바란다.

## 그렇다면, 각 객체들은 어떤 검증에 대한 책임을 가질까?

다시 본론으로 돌아와서, 위의 아키텍처 내부의 객체들은 어떤 검증 책임을 갖는지 살펴보자. 아래 객체들은 요청 처리 흐름에 따라 정리하였다.

### 1. ReqDTO/Controller

ReqDTO/Controller는 요청의 최초 진입점이며, ReqDTO는 형식, 제약 검증만 필요하다.

해당 레이어에서는 **비즈니스 규칙과 관련된 검증로직은 수행하지 않는다**. 그 이유는, 도메인에서 작성하는 비즈니스 규칙 검증 로직과 중복되기 때문이며, 중복된 로직을 수정하는 일은 휴먼 에러를 수반할 수 있다. **그렇기에 기본적으로 값의 유효성만 검증하고**, 도메인에게 비즈니스 규칙 검증 책임을 넘긴다.

- 예시: @Vaild를 통한, ReqDTO 검증 (`@NotBlank`, `@Pattern`, `@Size` )
  ![test.png](/assets/images/validation/validation00101.png)
  ![test.png](/assets/images/validation/validation00102.png)
    

### 2. Service

service 레이어는 기본적으로 도메인 레이어에만 의존하며, 도메인 객체와 {domain}RepositoryInterface를 호출하여 도메인과 인프라를 연결하고, use case 단위 로직을 조율한다. (우리 아키텍처에서 RepositoryInterface는 Domain Layer에 속한다.)

Service의 검증 책임은 다음 2가지로 한정한다.
>1. 의존하고 있는 외부 도메인과 연결시에 필요한 검증
2. 불러온 객체의 상태에 대한 검증

이때, 중요한 점은 비즈니스 규칙에 대한 검증은 최소화 해야한다. 비즈니스 규칙에 대한 검증은 기본적으로 Domain 객체의 책임이며, Service는 조정자의 역할만 수행하기 때문이다.

#### 예시1. 외부 도메인에 의존하지 않는 Service의 검증 (평가 정보 조회 API)

예를 들어, 로그인 사용자의 "지원서(Application)"의 "평가(Evaluation)" 정보를 조회한다고 가정하자. service 함수의 의사코드는 다음과 같다.

```java
//1. 입력받은 지원자 id와 평가자의 id로 "지원서" 타입 "평가" 조회
evaluation = evaluationRepository.findByApplicantIdAndEvaluatorId(applicantId, evaluatorId)

//2. 해당 평가 Evaluation 도메인의 타입이 "Application"인지 검증 (상태검증)
if evaluation.type != EvaluationType.APPLICATION:
    throw new InvalidEvaluationTypeException()

//3. Response로 변환 후 반환
return EvaluationResponse.from(evaluation)
```

즉, 위 예시에서 중요한 점은, 평가(Evaluation) 객체의 비즈니스 규칙 검증은 Evaluation 내부 vaildate()가 담당하고, Service는 단지 해당 use case에 필요한 상태 확인만 책임진다는 것이다.

하지만 위의 예시는 외부 도메인에 의존하지 않는다. 외부 도메인에 접근하는 경우는 어떨까? 아래 예시를 살펴보자.

#### 예시2. 외부 도메인에 의존하는 Service의 검증 (권한 부여 API)

로그인한 사용자 **홍길동**에게 **Programming** **동아리**의 **OWNER** **권한**을 부여하는 API를 생각해보자. 이는 ClubRole 도메인으로 들어오는 요청이며, service 함수의 의사코드는 다음과 같다.

```java
//1. clubId로 Club Domain Object를 불러온다.
club = clubRepository.findById(clubId)

//2. AdminId로 Admin Domain Object를 불러온다.
admin = adminRepository.findById(adminId)

//3. Club과 Admin을 기반으로 정적 팩토리 메소드 ClubRole.initalize()로
//  새 ClubRole 객체를 생성한다.
clubRole = ClubRole.initialize(club, admin)

//4. ClubRoleRepositoryInterface.save()로 저장한다.
clubRoleRepository.save(clubRole)

//5. 성공/실패 state와 필요데이터를 resDTO에 담아 응답한다.
return ClubRoleResponse.of(success = true, data = clubRole)
```

이 경우에도 외부도메인 Club과 Admin에 대한 비즈니스 검증은 수행하지 않는다. 이는 각각 도메인의 생성시점에 내부에서 검증이 완료된 객체이기 때문이다.

**또한, DB에서 조회된 Club, Admin의 객체가 존재하지 않는지 확인하는 책임도 Service에 있지 않다.** 그 책임은 infra 계층인, ClubRepositoryImpl, AdminRepositoryImpl이 수행하기 때문에, Service로 들어온 도메인 객체는 신뢰할 수 있다.

**정리하자면, service 로직은 use case에 기반한 객체 상태 검증만 책임지면 된다.**

사실 이는 당연한 원칙이다.
Service는 외부 레이어를 호출하고 조합하는 역할을 하며, 그 시점에 도달한 도메인 객체들은 이미 필요한 검증을 마친 상태이기 때문이다. 따라서, **Service는 use case에 맞는 필요한 상태만 확인하면 된다.**

### 3. Domain Object

도메인 객체는 핵심 비즈니스를 수행한다. 따라서, 기본적으로 비즈니스 규칙에 대한 검증 책임을 갖는다.

Domain Object의 생성 시점은 크게 두가지 케이스로 나눌 수 있다.

>1. 요청 → infra의 흐름에서 initalize()로 객체 생성
2. infra → 응답 흐름에서는 @builder로 객체 생성
>

객체를 생성할 수 있는 2가지 방법 모두 검증을 필히 수반하여야 한다. 즉, 생성 메소드 내부에는 vaildate() 메소드를 포함하여, 비즈니스 규칙의 검증이 반드시 필요하다.

이에 따라 Domain Object 컨벤션을 간단히 설명하면 다음과 같다.

> 1. initailize() 메소드 안에는 validate() 호출이 반드시 필요하다.
2. customBuilder 내부에는 builder호출과 vaildate()호출이 반드시 필요하다.
3. validate()는 Validatable 인터페이스를 상속받아 구현한다.
> 

검증의 핵심 객체인 만큼, 실제 코드 구현에 대한 자세한 내용은 다음 게시글에서 다룰 예정이다. 해당 게시글을 통해 무결성과 불변성을 보장하는 이상적인 Domain Object를 어떻게 구현할 수 있는지에 대해 설명할 예정이다.

### 4. Value Object

Value Object는 불변의 값을 표현하는 객체로, 우리 서비스에서 주로 Domain Layer에서 사용된다.

VO는 DTO와 마찬가지로, 잘못된 값이 객체로 생성되는 것을 막기 위해, 형식(Form)/ 제약(Constraint) 검증이 필요하다. 이는 객체 생성 정적 팩토리 메소드인 of() 내부에서 vaildate()를 호출하여 검증을 수행한다. 

또한 VO는 객체 생성시점에 유효성이 보장되므로, 생성 이후에는 별도의 검증이 필요하지 않다. (Infra 레이어에서 사용하는 Projection 객체도 동일하다.)

### 5. {domain-name}RepositoryInterface

**RepositoryInterface는 도메인 계층에 포함되는 영속성 접근 추상화이다.**    
Repository인데 도메인 계층? 영속성 접근 추상화? 어려운 용어로 쓰여 있지만 사실 단순하다. 

먼저, 우리 아키텍처의 원칙 중 하나를 살펴보자
![test.png](/assets/images/validation/validation00104.png)

> **Domain 레이어는 비즈니스 로직에만 집중해야 하며, 외부 레이어에 대한 의존성이 없어야 한다.**

(이는 위에 첨부한 아키텍처 구조를 보면 더 쉽게 이해할 수 있다.)

**이 원칙을 지키기 위해, RepositoryInterface는 파라미터와 반환타입으로 도메인 객체를 사용한다.** 그리고 이를 구현한 repositoryImpl(infra 레이어)는 내부에서 Mapper를 이용해, DB 객체인 Entity와 매핑한다. 즉, RepositoryInterface는 Domain Layer와 Infra Layer를 연결하는 어뎁터인 셈이다.

그럼 본론으로 돌아와서, RepositoryInterface는 검증 책임을 갖을까?
이때 중요한 점 2가지가 있는데, 이는 다음과 같다.

1. Domain 객체에 대한 검증 책임은 Domain과 Service가 갖는다.
2. Entity에 대한 검증 책임은 infra 계층이 갖는다. (아래 Entity파트에서 후출한다.) 

이 두가지 이유로, **RepositoryInterface는 그 어떤 검증 책임도 갖지 않는다. RepositoryInterface는 단순히 검증이 완료된 객체를 전달하고 반환하는 통로인 셈이기 때문이다.**

이로 인해 다음과 같은 설계 원칙을 도출할 수 있다. 

> DB 조회시 검증은 RepositoryImpl(Infra레이어)에서 책임지고, 이미 검증이 끝난 Domain Object가 입력/반환된다는 보장이 있기에, **RepositoryInterface의 반환값은 Optional<>이 될 수 없다.**
> 

### 6. {domain-name}RepositoryImpl

이제부터 infra 레이어에 진입한다. 

RepositoryImpl는 JPA를 기반으로(호출) 실제 영속성 로직을 구현하는 객체이며, RepositoryInterface를 구현하여 도메인과 Entity를 연결하는 역할을 한다.

Infra 레이어에서 수반되어야 할 검증 로직은 2가지로 다음과 같다.

> 1. DB 조회 후, Entity 상태 검증 (예: 해당 Entity가 존재하는가? 논리 삭제(soft Deleted) 되었는가?)
2. DB 조회/저장시, DB 제약 조건에 기반한 검증
>

**1번의 검증 책임은 RepositoryImpl 갖고 2번의 검증 책임은 Entity가 갖는다.**

1번 Entity 상태에 대한 검증을 먼저 살펴보자. **DB 조회 이후의 상태 검증은 RepositoryImpl의 책임이다. 이는 다음과 같은 유효성 검증을 포함한다.**

- 객체 자체가 존재하는지(Null-Check) 검증
- 논리 삭제 상태인지 검증
- 기타 비정상 상태인지 검증

이에 대한 예시 코드는 다음과 같다.

```java
AdminEntity adminEntity =
        adminJpaRepository
            .findById(evaluation.getEvaluatorId())
            .filter(entity -> !entity.getDeleted())
            .orElseThrow(() -> new EntityNotFoundException("AdminEntity not found or deleted"));
```

코드와 같이, adminJpaRepository로 조회한 AdminEntity가 `Optional.Empty()`가 아닌지, `.filter(entity -> !entity.getDeleted())`와 같은 Entity값 자체 유효성과 상태에 대한 검증을 작성해야 한다. (결국 이 때문에, 위에서 살펴본 RepositoryInterface 함수의 반환값은 Optional로 표현할 필요가 없다.)

**RepositoryImpl도** 마찬가지로 비즈니스 규칙에 대한 검증은 하지 않는다.

### 7. Entity

이제 이어서 2번 제약 검증에 대해 살펴보고, 왜 Entity가 2번의 검증 책임을 갖는지 살펴보자.

먼저 제약 검증이다. 2번 제약 검증은 DB 제약으로 무결성을 검증하는 것으로 충분하다. 따라서 Entity 내부에 필드 어노테이션과 테이블 제약 조건 추가로 검증을 수행할 수 있다.

그럼, 형식검증 로직은 수행하지 않아도 되는가? 

**사실 위에서 작성한 Entity의 DB제약 조건으로는 형식 검증을 완전히 보장할 수 없다.** DB제약 조건으로 형식 검증인 필드 값의 구조/형식 검증을 수행할 수 없기 때문이다. 예를 들어, DB의 email 레코드의 Length는 Entity에 제약조건으로 검증할 수 있지만, [example@example.com](mailto:example@example.com) 과 같은 형식에 대한 검증은 제약 조건으로 검증할 수 없다.

그렇다면, Entity에 형식 검증 로직도 작성해야 할까? 

결론부터 말하면, 난 그렇지 않다고 판단한다.

1. **Entity는 DB의 테이블을 반영하는, 단순한 영속성 모델이다.**
    
    Entity는 단순히 DB 테이블과 매핑되는 데이터의 모델이며, JPA의 영속성 레이어의 핵심적인 역할을 수행하는 객체이다.   
    따라서 Entity는 오직 영속성 영역의 역할에 집중해야 한다. 그렇기에 검증 로직이 섞이게 되면 역할이 불분명해지며, 테스트도 어려워진다.
    
2. **Entity는 이미 신뢰된 값만 다루는 구조이다.**
Entity가 만들어지는 시점을 생각해보자.          

    **도메인 → Entity**      
      이 시점에는 이미 DTO,VO를 통해 형식/제약 검증을 수행했으며, Domain 객체도 내부 함수를 통해 검증된 신뢰할 수 있는 상태이다.        

    **DB → Entity**       
      이 경우에도, DB로부터 직접 반환한 값이므로 신뢰할 수 있는 상태이다. 
        

**결국, Entity는 DB와 관련된 제약 검증 책임은 가지나, 형식 검증까지 수행할 필요는 없다.**

### 8. Mapper
Mapper는 객체 변환을 위한 정적 유틸 메소드이다. 따라서 검증로직은 작성할 필요가 없다. 

### 9. JpaRepository
단순한 CRUD 및 쿼리 DSL 제공 역할로 디비 접근만을 수행하기 때문에 이 또한 검증로직이 필요하지 않다. 해당 함수를 통해 반환된 값이 RepositoryImpl로 들어가게 되며, 즉 RepositoryImpl에서 검증 책임을 갖는다.

### 참고. Response DTO는 검증이 필요하지 않을까?

마지막으로 응답 값인 Response DTO는 검증을 수행하지 않아도 괜찮을까?

**Response DTO는 일반적으로 검증 대상이 아니다.**
왜냐하면, 시스템 내부에서 이미 도메인 로직을 거쳐 생성된 유효성 있는 값으로
신뢰할 수 있기에 검증이 불필요하다. 

다만, 출력 데이터의 신뢰성과 보안이라는 관점에서 검토는 필요하다. 예를 들어, 보안 상 노출되면 안 되는 민감한 정보 제거와 같은 경우가 있을 수 있다. 하지만 이는 Entity 자체를 클라이언트에게 반환해 주는 경우 발생할 수 있는 상황이다.

ResponseDTO의 생성 목적이 결국 이를 방어하기 위함이므로, ResponseDTO 자체로 충분하며, 별도의 검증로직은 필요하지 않다고 생각한다.

## 회고

우리 서비스의 아키텍처를 기반으로 어떤 계층이 검증 책임을 가져야 하는지 정의하는 시간을 가졌다. 서비스의 아키텍처가 이와 다르다면 조금의 차이는 있겠지만, 결국 각 레이어의 책임과 역할을 토대로, 검증을 누가 수행할 것인가 결정하는 것이 핵심일 것이다.

### 참고 레퍼런스

[코틀린, 저는 이렇게 쓰고 있습니다 - 카카오페이 기술 블로그](https://tech.kakaopay.com/post/katfun-joy-kotlin/)