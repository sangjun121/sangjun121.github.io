---
layout: post
title: Security Filter에서 발생한 예외를 GlobalExceptionHandler로 보내는 것이 좋을까?
subtitle: Spring Security Filter Chain의 예외 책임은 누가 가져야 할까에 대한 학습 기록
author: 조상준
categories: Spring Security SSOC
banner:
  image: ../assets/images/springsecurityexception/securityExceptionHandling003.png
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold;"
  subheading_style: "color: gray"
tags: Spring Security SSOC
top: 1
comments: true
sidebar: []
---
## 현재 상황
현재 우리 서비스 SSOC는 Spring Security의 Filter에 로그인 로직과 JWT 검증 로직을 구현해 둔 상태이다. 

이때, Security Filter에서 발생하는 예외도 @ControllerAdvice를 이용한 GlobalExceptionHandler에서 예외응답을 처리해주려 하였으나, 예외가 Controller에 들어오지 않아 지정된 응답 값을 보내주지 못하였다.

> these exceptions are thrown by the authentication filters behind the *DispatcherServlet* and before invoking the controller methods,*@ControllerAdvice* won’t be able to catch these exceptions.
> 

**이는 당연하게도, Security의 필터들은 DispatcherServlet이 컨트롤러를 호출하기 전에 실행되기 때문에, 이 필터에서 발생하는 예외들을 @ControllerAdvice가 잡을 수 없기 때문이다.**

따라서, Security Filter의 예외들은 Security가 제공하는 AuthenticationEntryPoint (인증예외 진입점), AccessDeniedHandler(인가예외 진입점)로 들어오기 때문에, 예외 발생시 어떻게 처리할 것인지 이 헨들러에서 로직을 작성해야한다.

**이때, MVC 내부에 *@ControllerAdvice가* 존재하는 가운데,** 각 진입점에서 GlobalExceptionHandler로 예외 응답 책임을 위임할 것인지, 아니면 진입점에서 예외 응답을 제공하여 Filter 단에서 바로 응답을 내뱉을 것인지, 해당 구현과정에서의 고민거리에 대해 기록해보고자 한다.

우선 아래 구현상황을 이해하기 위해, 간단한 사전지식을 살펴보자.

## Spring Security Filter Chain 내부에서 발생하는 Exception과 처리 시퀀스
[Spring Security 공식문서 - Handling Security Exceptions](
https://docs.spring.io/spring-security/reference/servlet/architecture.html#servlet-exceptiontranslationfilter)

공식 문서의 Handling Security Exceptions 파트를 읽어보면, Security Filter Chain 내부에서 발생하는 예외를 어떤 방식으로 처리 할 수 있는지 Security의 구현체를 확인할 수 확인할 수 있다. 이 시퀀스를 우선적으로 이해하고 논의를 이어나가고자 한다.

### Security Filter Chain 내부에서는 어떤 예외가 발생하고 누가 처리할까?

Spring Security에서 인증(Authentication)이나 인가(Authrization)와 관련된 문제가 발생하면, 일반적으로 AuthenticationException(인증 실패), AccessDeniedException(인가실패 - 권한 없음)과 같은 예외가 발생한다. 이때, Security의 ExceptionTranslationFilter는 이런 예외가 발생했을 때, 단순히 예외를 터뜨리는 것이 아니라 적절한 HTTP 응답(예: 401 Unauthorized, 403 Forbidden)으로 바꿔서 사용자에게 알려주는 역할을 한다.

공식문서에서 제공하는 ExceptionTranslationFilter의 수도 코드과 시퀀스 다이어그램을 보면서 각 예외별 처리 시퀀스를 살펴보자.

![test.png](/assets/images/springsecurityexception/securityexceptionhandling001.png)

```java
try {
    filterChain.doFilter(request, response);
} catch (AccessDeniedException | AuthenticationException ex) {
    if (!authenticated || ex instanceof AuthenticationException) {
        startAuthentication();
    } else {
        accessDenied();
    }
}
```
### 1. AuthenticationException(인증 예외) 발생시 시퀀스

우선 로그인하지 않은 사용자가 /my-page에 접근하였다고 가정하자.

1. 로그인 되지 않은 요청은, 필터 내부에서 AuthenticationException이 발생하고 그림의 2번에 해당하는 startAuthentication 메소드가 수행된다.
2. startAuthentication 진입 후, 기존에 남아 있을지 모르는 SecurityContextHolder를 초기화 한다.
3. RequestCache에 현재, /my-page path로 들어온 요청을 저장한다.
    - 여기서 Request Cache에 대해 간단하게 살펴보자. RequestCache에 요청을 저장하는 이유는 사용자가 로그인 후 원래 가려던 페이지(마이페이지)로 리다이렉트 시키기 위함이다. 
    - 해당 Cache가 있음으로서 로그인이 완료된 이후 이전 요청 정보를 기반으로 main 페이지가 아닌 my page로 redirect 시키는 것과 같은 기능을 구현할 수 있다.
    - 하지만 이는 Spring Security의 기본 동작이 “웹사이트(세션 기반)“에 최적화되어 있기 때문에 필요한 단계이다. 우리 서비스 SSOC의 API서버는 Stateless 서버로 요청에 대한 사용자 상태(세션, 쿠키 등)를 기억하지 않는 구조이기에 RequestCache를 아예 사용하지 않는다.
4. AuthenticationEntryPoint는 *“인증이 필요하다. 즉, 로그인이 필요하다”*는 사실을 클라이언트에게 알려주거나(401 Unauthorized), Login 페이지로 redirect를 수행한다.

### 2. AccessDeniedException(인가 예외) 발생시 시퀀스

인가 에러는 인증된 사용자에 대해, 권한이 부족한 경우 발생하는 예외이다. 따라서, 위의 수도코드를 보면 인증된 사용자에 대해, 권한 부족으로 발생하는 경우이므로 accessDenied()가 실행된다. 

그림의 3번과 같이 이때 AccessDeniedException는 AccessDeniedHandler를 invoked 시킨다.

**정리하자면, Spring Security의 ExceptionTranslationFilter는 Security Filter Chain 내부에서 발생한 AuthenticationException이나 AccessDeniedException을 각각 AuthenticationEntryPoint 또는 AccessDeniedHandler로 위임하여 예외 응답 처리를 담당하도록 한다.**

## 공식문서에서 찾아본 Security 예외 응답의 책임

다시, 본론으로 돌아와서 우리가 고민 중인 예외 응답을 각각 AuthenticationEntryPoint, AccessDeniedHandler에서 직접 작성해야 할까, 아니면 여기서 MVC에 구현된 @ControllerAdvice로 책임을 위임해야 할까? 이에 대한 답이 공식문서에 나와 있었을까?

[Spring Security 공식문서 - Handling Security Exceptions](https://docs.spring.io/spring-security/reference/servlet/architecture.html#servlet-exceptiontranslationfilter)에는 다음과 같은 문장이 있다.

> The [ExceptionTranslationFilter](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/web/access/ExceptionTranslationFilter.html) allows translation of [AccessDeniedException](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/access/AccessDeniedException.html) and [AuthenticationException](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/core/AuthenticationException.html) into HTTP responses.
> 

이와 같이 Spring Security의 ExceptionTranslationFilter → AuthenticationEntryPoint, AccessDeniedHandler 구조는 필터 예외를 HTTP responses 내부에 넣어주는 것을 허용하고 있다.

**또한, AuthenticationEntryPoint와 AccessDeniedHandler의 기본 구현체들 역시 예외 발생 시 HTTP 응답을 직접 반환하는 방식으로 설계되어 있음을 확인할 수 있다.**

![test.png](/assets/images/springsecurityexception/securityExceptionHandling002.png)
*AuthenticationEntryPoint 구현체*

![test.png](/assets/images/springsecurityexception/securityExceptionHandling003.png)
*AccessDeniedHandler 구현체*

이를 통해, Filter 내부의 예외 응답 책임은 Spring MVC가 아닌 Spring Security 내부에 있다고 보아도 적절해 보인다.

## **Spring Security 필터 레벨에서 예외 응답을 처리하는 것이 더 빠르고 안전하다:** 요청 흐름을 기반으로 살펴보기

요청의 흐름을 기반으로 살펴보더라도, Spring Security의 AuthenticationEntryPoint나 AccessDeniedHandler 같은 필터 단계에서 예외 응답을 바로 처리하는 것이, MVC까지 요청을 넘겨 @ControllerAdvice에서 처리하는 것보다 일반적으로 더 빠르고 안전하다.

이에 대한 보조 설명을 위해 Spring기반 어플리케이션의 요청처리 흐름을 간단하게 도식화 해보았다.

![test.png](/assets/images/springsecurityexception/securityExceptionHandling004.png)

FilterChain/SecurityFilterChain의 일부인 ExceptionTranslationFilter은 이미 Servlet Container가 생성해서 넘긴 HttpServletRequest/Response가 있기에 예외진입점(엔트리포인트/핸들러)에서 클라이언트에게 바로 응답을 보낼 수 있다. 이는 Spring MVC 레이어로(파란색 영역)의 접근이 필요하지 않으며, 바로 클라이언트에게 응답을 보내줄 수 있다.

**다만, 예외진입점에서 @ControllerAdvice로 예외책임을 위임한다면, MVC에서 응답해주는 방식으로 한층 더 깊이 요청이 들어가게 된다.** 이 요청 흐름만 보아도, Security Filter에서 예외응답을 보내주는 것이 건강해 보인다.

## 그렇다면, 예외 응답 책임을 MVC의 **@ControllerAdvice로 위임하는 것은 권장되지 않는가?**
**사실 해도 괜찮다.**
### 근거1. Spring Security 공식 Reference

위의 내용을 확인했음에도, 저 문장은 예외 응답을 반드시 Spring Security 내에서만 처리해야 한다는 의미는 아닐 뿐더러, 이 응답 책임을 MVC로 위임하는 것은 안전할까에 대한 궁금증이 계속 남아 있었다. 이에 대한 답변은 간접적으로 나마 Spring Referance 문서에서 확인할 수 있었는데 이는 다음과 같다. 

 [Spring Security 공식 Referance](https://docs.spring.io/spring-security/site/docs/4.2.15.RELEASE/reference/htmlsingle/#exception-translation-filter) 

![test.png](/assets/images/springsecurityexception/securityExceptionHandling005.png)

![test.png](/assets/images/springsecurityexception/securityExceptionHandling006.png)

해당 레퍼런스를 읽어보면, AuthenticationEntryPoint의 경우, 권장 처리 방법은 로그인을 수행하도록 리다이렉트하거나, 우리가 어플리케이션에서 사용하는 인증 매커니즘을 실행시키도록 구현체를 작성할 것을 나타내고 있다. 

**하지만 AccessDeniedHandler의 경우에는 추가적으로 MVC 컨트롤러로 넘기는 방법 또한 명시되어 있다.**

이 차이점에 대해 감히 예측해 보자면, 이는 AuthenticationEntryPoint과 AccessDeniedHandler의 진입시점의 차이를 근거로 들 수 있을 것 같다.

우선 AuthenticationEntryPoint의 진입 시점을 생각해 보자, 인증 예외(AuthenticationException)가 발생한 이후 진입한다. AuthenticationException는 로그인 실패로 Security Filter 내부에서 걸려졌고 SpringSecurityContext가 초기화 되지 않았을 뿐더러, 아직 MVC로 진입하지 않았다. 이 때문에 MVC 내부의 Controller에 넘겨주는 방식은 권장되지 않아보인다.

**(조금 깊이 파고 들어가면, 만약 첫번째 요청인 경우, AuthenticationEntryPoint 진입시점에 아직 HttpServlet 인스턴스 자체도 생성되지 않았을 수도 있다.)**

반대로, AccessDeniedHandler의 진입 시점을 생각해보면, 정상적으로 인증(Authentication)은 되었고, SpringSecurityContext도 초기화가 되었으나, MVC로 진입 이후에 Service 메소드에 달린 @HasRole과 같은 어노테이션으로 예외가 발생하였기에 AccessDeniedHandler가 Invoked 된 것이다. 따라서, 이미 MVC에 진입을 하였고 이에 따라 MVC 내부의 @ControllerAdvice로 위임하는 방식도 함께 설명한 것으로 보인다.

 

**결론적으로, Spring Security는 기본적으로 보안 관련 예외에 대한 처리를 Filter단에서 *기본 제공*하지만, AccessDeniedHandler의 경우 필요에 따라 개발자가 응답 처리를 MVC(@ControllerAdvice) 쪽으로 위임할 수 있도록 설계됨을 알 수 있다.**

### 근거2. Security Filter와 동일 선상에 있는 기타 Servlet Filter도 예외 응답은 MVC를 통해 응답된다.

이 궁금증에 대해 고민하던 가운데, Security Filter Chain이 포함된 Tomcat의 FilterChain 내부에는 Spring Security 외에도 다양한 필터들이 함께 동작함을 떠올리게 되었다.

다시 말해, Security Filter는 같은 레이어에 위치한 다른 일반 필터들도 동일한 예외 처리 메커니즘 안에 있다.

위의 도식을 다시보자

![test.png](/assets/images/springsecurityexception/securityExceptionHandling004.png)

**그렇다면, 동일선상에 위치한 다른 필터들은 예외를 어떤 방식으로 처리하고 있는지 확인하면, Spring이 예외 처리를 어디서, 어떻게 하는 것을 권장하는지 알 수 있지 않을까?**

Servlet Container나 Filter에서 예외가 발생하는 경우, WAS가 예외처리를 하기 위해 /error로 요청을 넘기고, DispatcherServlet를 통해 BasicErrorController로 예외가 들어가게 된다. 결국 예외 응답의 책임은 BasicErrorController가 가지고 있다. (단, 이는 @ControllerAdvice로 구현된 GlobalExceptionHandler가 없음을 가정한다.)

**결론적으로, 기타 필터들도 역시 예외가 발생하면, 이에 대한 최종 응답 책임은 MVC 레이어가 가지고 있다. 이것만 보아도, Spring Security가 예외 처리를 반드시 필터 내부에서 마쳐야만 한다는 근거는 약하다.**

### 근거3(부가설명). Baeldung에서도 시큐리티 내부 핸들러 외에도, HandlerExceptionResolver를 사용하여 Filter의  Security Exception을 MVC로 위임하는 방식도 함께 설명한다.

부가 설명을 덧붙이자면, 공식문서 말고도 Best Practice가 있는지 기타 가이드 블로그도 찾아보았다. (이 내용은 건너뛰어도 좋다.)

[baeldung 블로그 - spring security exceptionhandler](https://www.baeldung.com/spring-security-exceptionhandler)

Baeldung에서는 **3. Without *@ExceptionHandler*과** **4. With @ExceptionHandler** 두가지 방식 모두 예를 들어 Security 내부의 예외처리를 설명하고 있다.

해당 문서에도 구체적인 어느 방식이 더 권장되는지는 언급하지 않았고,

> This approach allows us to use exactly the same exception handling techniques but in a cleaner and much better way in the controller advice with methods annotated with *@ExceptionHandler*.
> 

이 문장과 같이, MVC의 GlobalExceptionHandler에 예외책임을 위임하는 방식이 더 깔끔하다고만 나와 있을 뿐 두가지 방법 모두 소개하고 있었다.

## 결론. 구현 방향성 - 발생시점과 서비스 요구사항을 기반으로

위의 장황한 설명을 기반으로 아래 결론을 도출했다.

우선 Security의 공식문서와 Default 구현체에서 설명하듯, AuthenticationEntryPoint와 HandlerExceptionResolver의 역할과 책임, 즉 “*예외응답을 생성하여 클라이언트한테 알려준다.”* 를 준수하되, 우리 서비스 요구사항에 맞게 인가 예외 응답 책임은 MVC의 @ControllerAdvice가 맡는 것으로 결정하였다. (이에 대한 SSOC의 서비스 요구사항은 아래서 자세히 설명한다.)

결국 어떤 것이 더 선호되는지에 대해 정확히 명시 되어 있지 않았지만, 나는 예외 발생 시점과 우리 서비스 SSOC의 권한 인증방식을 기준으로, 다음과 같이 결정하였다.

> 인증예외([AuthenticationException](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/core/AuthenticationException.html))는 AuthenticationEntryPoint에서 직접 응답을 반환하는 것으로, 인가예외([AccessDeniedException](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/access/AccessDeniedException.html))는 HandlerExceptionResolver로 @ControllerAdvice로 응답책임을 위임한다.
> 

사실 서비스 요구사항이 가장 결정적이었는데 이를 살펴보자.

### 서비스 요구사항 - AOP로 구현된 동아리 내부 권한에 대한 인가 로직이 이미 MVC에 있다.

SSOC 서비스 회원 요구사항을 보면, 사용자를 아래와 같이 구분하고 있다. (RYC는 우리서비스의 레거시 이름이다.)

![test.png](/assets/images/springsecurityexception/securityExceptionHandling007.jpg)

우리 서비스는 로그인한 회원과 하지 않은 회원으로 지원자와 관리자를 구분하고, 관리자는 내부 커스텀 Role인  President와 Member로 DB테이블에서 관리하고 있다. 이 내부 커스텀 Role은 ClubRole로 지칭한다.

 왜 그럴까? SSOC에 로그인이 필요한 사용자는 관리자(Admin)이다. 해당 관리자들은 여러 동아리에 소속될 수 있으며, 각 동아리 내부의 권한을 갖기에, 해당 사용자를 특정 ROLE 하나로 픽스하는 것은 불가능하다. (예를 들어, 사용자 홍길동은 A동아리의 회장(PRESIDENT)임과 동시에 B동아리의 동아리원(MEMBER)일 수 있다.)

따라서, Security가 관리하는 ROLE은 로그인 사용자들을 구분하기 위한 용도로 사용되지 않는다.(이 때문에 Security가 검증하는 권한의 종류는 ROLE.USER만 있다. 결국 로그인한 회원은 모두 ROLE.USER인 상태에서 내부 커스텀 ROLE로 세부 권한이 결정된다.) 

이렇게 생각하면 SSOC 사용자들은 Security에서 인증을 성공하고 인가를 실패하는 경우는 발생하지 않는다. 이제 와서 조금 허무하지만, 결론적으로 우리 서비스에서 AccessDeniedHandler가 작동할 케이스는 없다고 보아도 좋다. (다만, 추후 요구사항 변화와 시큐리티 내부 구현 사항을 고려했을 때 해당 AccessDeniedHandler의 구현체는 작성해 두었다.)

그럼 이 내부 커스텀 ROLE인 President와 Member를 검증하는 로직은 어디에 구현하였을까? 바로 Spring AOP의 Before Advice로 Controller 진입 전에 검증하도록 구현하였다. (이에 대한 세부 구현사항은 추후 업로드 예정이다.) MVC 내부에서 발생하는 예외인 만큼, ClubRole의 인가 실패에 발생하는 예외 응답 책임은 @ControllerAdvice가 가지고 있다.

**결론적으로, 이렇게 인증/인가 즉 역할의 시점으로 보았을 때, 인가 실패 예외는 MVC에서 한번에 관리하는 것이, 더 통일성 있다고 판단하였다. 따라서, 현재 상황에서는 AccessDeniedHandler는 작동할 경우가 없겠지만, 만약 작동한다 하면 ClubRoleException과 같은 맥락으로, 인가 예외응답 생성 책임을 갖는 MVC의 HandlerExceptionResolver로 넘겨 @ControllerAdvice에서 책임지는 것이 더 통일성 있어 보였다.**

## 회고
Filter 내부의 예외처리 책임을 누가 가질까에 대한 논의로 글이 두서 없이 길어졌다. 다만, 사용자 요청의 흐름에서 예외가 발생하는 위치에 따라 기존 구현체는 누가 책임을 갖는지 알 수 있었고, 전반적인 어플리케이션 내부의 예외처리 시퀀스에 대해 정리할 수 있는 기회가 되었다.

아직도 고민되는 점은 서비스 요구사항에 따라 기본 구현체의 권장사항에 반하여 커스텀하는 것이 적절한지, 결국 이로써 얻을 수 있는 장점이 그렇게까지 매력적으로 보이지는 않아 조금 아쉽다. 

이에 대해 미쳐 생각하지 못했던 의견이나 잘못된 지점에 대한 피드백은 언제나 환영합니다!