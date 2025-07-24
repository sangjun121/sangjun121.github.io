---
layout: post
title: Security Filter에서 발생한 예외를 GlobalExceptionHandler로 보내는 것이 좋을까?
subtitle: 인증/인가 실패 진입점을 기준으로
author: 조상준
categories: Spring Security SSOC
banner:
  image: ../assets/images/banners/basic.png
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 3.25em; font-weight: bold;"
  subheading_style: "color: gold"
tags: spring security ssoc
top: 1
sidebar: []
---
### 현재 상황

현재 우리 서비스 SSOC는 Spring Security를 이용하여 로그인(인증/인가)/ JWT access token 검증(jwt필터)을 구현해둔 상태이다. (Refresh 토큰 재발급의 경우 DB조회가 필요하기에, RT의 검증은 filter말고 service단에서 수행한다. → 현재 인증관련 로직이, service와 filter에 분산되어 있기에 filter내부로의 이전이 필요할 것같다.)

 다만, Filter 내부에 로직이 작성되어 있는 로그인, AT 검증의 경우, 해당 필터에서 발생하는 예외들은 **DispatcherServlet 앞 단계**인 **Security Filter**에서 발생하기 때문에, GlobalExceptionHandler(@ControllerAdvice)에서 해당 예외들을 잡을 수 없다.

따라서, Security가 제공하는 **AuthenticationEntryPoint(인증예외 발생시 진입점), AccessDeniedHandler(인가예외 발생시 진입점)에서 예외 발생시 수행할 처리 로직을 작성해야한다.**

이때, MVC내부에 GlobalExceptionHandler이 존재하는 가운데, 각 처리 지점에서 GlobalExceptionHandler로 예외응답 책임을 위임할 것인지, 아니면 해당 필터 내부에서 예외응답을 제공해줄 것인지, 해당 구현과정에서의 고민거리에 대해 기록해보고자 한다.

우선 아래 구현상황을 이해하기 위해, 간단한 사전지식을 살펴보자.

### Spring Security 내부에서 발생하는 예외 시퀀스

Spring Security 공식문서에서 권장되는 예외 처리 방식이 있는지 확인하기 위해 읽어 보았다.

https://docs.spring.io/spring-security/reference/servlet/architecture.html#servlet-exceptiontranslationfilter

**Handling Security Exceptions에서 설명하고 있는 예외처리 방식으로 Security가 제공하는 예외처리 시퀀스를 확인할 수 있었다. 이 시퀀스를 우선적으로 이해하고 논의를 이어나가고자 한다.**

Spring Security에서 인증(로그인)이나 인가(권한)와 관련된 문제가 발생하면, 보통 AccessDeniedException(권한 없음)이나 AuthenticationException(인증 실패) 같은 예외가 발생한다. 이때, Security의 ExceptionTranslationFilter는 이런 예외가 발생했을 때, 예외를 그냥 터뜨리는 게 아니라 적절한 HTTP 응답(예: 401 Unauthorized, 403 Forbidden)으로 바꿔서 사용자에게 알려주는 역할을 한다.

공식문서에서 제공하는 ExceptionTranslationFilter의 수도 코드를 읽어보면

![exceptiontranslationfilter.png](Security%20Filter%E1%84%8B%E1%85%A6%E1%84%89%E1%85%A5%20%E1%84%87%E1%85%A1%E1%86%AF%E1%84%89%E1%85%A2%E1%86%BC%E1%84%92%E1%85%A1%E1%86%AB%20%E1%84%8B%E1%85%A8%E1%84%8B%E1%85%AC%E1%84%85%E1%85%B3%E1%86%AF%20GlobalExcept%20237976a7f22380d6a1ffcd66dc95851c/exceptiontranslationfilter.png)

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

1. 로그인 되지 않아 필터 내부에서 AuthenticationException이 발생하고 그림의 2번에 해당하는 startAuthentication이 수행된다.
2. 기존에 남아 있을지 모르는 SecurityContextHolder를 초기화 한다.
3. RequestCache에 현재, /my-page path로 보낸 요청을 저장한다.
    - 여기서 RequestCache에 요청을 저장하는 이유는 로그인 후 사용자가 원래 가려던 페이지(마이페이지)로 자동 이동시키기 위해서 cache에 저장해 둔 것이다. 그래야 로그인이 완료된 이후 cache정보를 기반으로 메인페이지가 아닌 my page로 redirect 시키기 위해.
    - 하지만 이는 Spring Security의 기본 동작이 “웹사이트(세션 기반)“에 최적화되어 있기 때문에 필요한 단계이다. 우리 서비스 SSOC의 API서버는 Stateless 서버로 요청에 대한 사용자 상태(세션, 쿠키 등)를 기억하지 않는 구조이기에 RequestCache를 아예 사용하지 않는다.
4. AuthenticationEntryPoint는 “인증이 필요하다 즉, 로그인이 필요하다”는 사실을 클라이언트에게 알리거나(401 Unauthorized), Login 페이지로 redirection을 수행한다.

### 2. AccessDeniedException(인가 예외) 발생시 시퀀스

인가 에러는 인증된 사용자에 대해, 권한이 부족하는 경우 발생하는 예외이다. 따라서, 위의 수도코드를 보면 인증된 사용자에 대해, 권한 부족이 발생하는 경우이므로 accessDenied()가 실행된다. 그림의 3번과 같이 이때 AccessDeniedException는 AccessDeniedHandler를 invoked 시킨다.

정리하자면, **Spring Security의 ExceptionTranslationFilter는 Security 필터 체인 내부에서 발생한 AuthenticationException이나 AccessDeniedException을 각각 AuthenticationEntryPoint 또는 AccessDeniedHandler로 위임하여 예외 응답 처리를 담당하도록 한다.**

즉, 본론으로 돌아와서 우리가 해야하는 예외응답을 각각 **AuthenticationEntryPoint, AccessDeniedHandler에서 직접 작성해야 할까, 아니면 여기서 MVC에 구현된** @ControllerAdvice로 책임을 위임해야할까에 대한 권장 사항은 공식문서에 구체적으로 기술되어 있지 않았다.

하지만, Spring Security/Servlet Applications/Architecture/**Handling Security Exceptions 에는** 

> The [`ExceptionTranslationFilter`](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/web/access/ExceptionTranslationFilter.html) allows translation of [`AccessDeniedException`](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/access/AccessDeniedException.html) and [`AuthenticationException`](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/core/AuthenticationException.html) into HTTP responses.
> 

위와 같이 [`ExceptionTranslationFilter`](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/web/access/ExceptionTranslationFilter.html) 이 HTTP responses를 보내준다고 명시되어 있기에 Filter 내부의 응답 책임은 Spring MVC가 아닌 Spring Security 내부에 있다고 보아도 적절해 보인다.

하지만, 예외책임을 누가 갖는가에 대한 명확한 언급사항이 없기에 다른 문서도 찾아보았다.

### Baeldung에서는 시큐리티 내부 핸들러 외에도, HandlerExceptionResolver***를 사용하여 Filter의  Security Exception을 Application context로 위임하는 방식도 함께 설명한다.***

https://www.baeldung.com/spring-security-exceptionhandler

Baeldung에서는 [**3. Without *@ExceptionHandler*](https://www.baeldung.com/spring-security-exceptionhandler#without-exceptionhandler) 과** [4. With @ExceptionHandler](https://www.baeldung.com/spring-security-exceptionhandler#with-exceptionhandler) 두가지 방식으로 예외처리를 설명하고 있다. 3번은 위와 같이 Security의 예외진입점인 핸들러에서 예외응답을 반환하는 방식이고, 4번은 **Spring Security 예외를 일부러 Spring MVC의 전역 예외 처리(@ControllerAdvice, @ExceptionHandler)로 보내서, 다른 일반 컨트롤러의 예외들과 동일하게, 더 일관되고 깔끔하게 예외를 처리하는 방식이다.**

해당 문서에도 

> This approach allows us to use exactly the same exception handling techniques but in a cleaner and much better way in the controller advice with methods annotated with *@ExceptionHandler*.
> 

와 같이 4번 방식을 이용하여, MVC의 GlobalExceptionHandler에 예외책임을 위임하는 방식이 더 깔끔하다고만 나와 있을뿐 두가지 방식 모두를 소개하고 있다.

두가지 문서를 읽고, Security가 구현해둔 **AuthenticationEntryPoint와** HandlerExceptionResolver의 역할과 책임, 즉 “예외응답”을 생성하여 클라이언트한테 알려준다.를 준수하되, 우리 서비스 요구사항에 맞게 인가 책임은 MVC의 @**ControllerAdvice가 수행하는 것으로 커스텀 하였다. (이에 대한 SSOC의 서비스 요구사항은 아래서 자세히 설명한다.)**

결국 어떤 것이 더 선호되는지에 대해 정확히 명시 되어 있지 않았지만, 나는 예외 발생 시점과 우리 서비스 SSOC의 권한 인증방식을 기준으로, 인증 예외([`AuthenticationException`](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/core/AuthenticationException.html))는 **AuthenticationEntryPoint에서 직접 응답을 반환하는 것으로, 인가예외(**[`AccessDeniedException`](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/access/AccessDeniedException.html))**는** HandlerExceptionResolver로 **@ControllerAdvice로 응답책임을 위임하는 것으로 결정하였다.**

이에 대한 근거는 다음과 같다.

### 근거1. 인증 예외 발생시점과 인가 예외 발생시점은 다르다.

인증 예외 [`AuthenticationException`](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/core/AuthenticationException.html) 발생 시, **AuthenticationEntryPoint는 
• “아직 인증되지 않은 사용자”가 보호된 리소스에 접근할 때 동작할때 작동한다. 따라서 SecurityContext가 초기화 되지도 않은 사용자를 MVC단으로 넘기는 로직은 오류가 있다. 따라서 Filter의 구현책임 그대로 AuthenticationEntryPoint에서 직접 넘겨주는 것이 맞다.**

다만 **AccessDeniedHandler의 경우는 조금 다르다. 이미 인증에 성공한 사용자이며, 이 시점에는 SecurityContext에 인증 정보가 이미 들어있으며, 즉 사용자가 누군지, 어떤 권한이 있는지 모두 확인된 상태이다. 이 상황에서 MVC의 Controller단으로 예외를 넘기는 것은 어색하지 않다. 다만 Controller 내부로 들어가 보호된 리소스에 접근하는 것은 당연히 안된다.**

이에 대한 근거로 아래 공식문서를 예로 들수 있을 것 같다. **AuthenticationEntryPoint의 권장 처리 방법은 로그인을 수행하도록 리다이렉트하거나, 우리가 어플리케이션에서 사용하는 인증 매커니즘을 실행시키도록 구현체를 작성할 것을 나타내고 있다.** 

하지만 반대로  **AccessDeniedHandler의 경우에는 대안적으로 MVC 컨트롤러로 넘기는 방법 또한 명시되어 있다.**

![스크린샷 2025-07-23 오후 6.21.22.png](Security%20Filter%E1%84%8B%E1%85%A6%E1%84%89%E1%85%A5%20%E1%84%87%E1%85%A1%E1%86%AF%E1%84%89%E1%85%A2%E1%86%BC%E1%84%92%E1%85%A1%E1%86%AB%20%E1%84%8B%E1%85%A8%E1%84%8B%E1%85%AC%E1%84%85%E1%85%B3%E1%86%AF%20GlobalExcept%20237976a7f22380d6a1ffcd66dc95851c/%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2025-07-23_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_6.21.22.png)

![스크린샷 2025-07-23 오후 6.21.37.png](Security%20Filter%E1%84%8B%E1%85%A6%E1%84%89%E1%85%A5%20%E1%84%87%E1%85%A1%E1%86%AF%E1%84%89%E1%85%A2%E1%86%BC%E1%84%92%E1%85%A1%E1%86%AB%20%E1%84%8B%E1%85%A8%E1%84%8B%E1%85%AC%E1%84%85%E1%85%B3%E1%86%AF%20GlobalExcept%20237976a7f22380d6a1ffcd66dc95851c/%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2025-07-23_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_6.21.37.png)

### 근거2. 서비스 요구사항

SSOC서비스 회원 요구사항을 보면, 사용자를 아래와 같이 구분하고 있다.

우리 서비스는 로그인한 회원과 하지 않은 회원으로 지원자와 관리자를 구분하고, 관리자는 내부 ROLE인 OWNER와 MEMBER로 DB테이블에서 관리하고 있다. 

왜 그럴까? SSOC에 로그인이 필요한 사용자는 관리자 이다. 해당 관리자들은 여러 동아리에 소속될 수 있으며, 각 동아리 내부의 권한을 갖기에, 해당 사용자를 특정 ROLE 하나로 픽스하는 것은 불가능하다. (예를 들어 설명하자면 사용자 홍길동은 A 동아리의 임원진(OWNER)임과 동시에 B동아리의 동아리원(MEMBER) 일수 있다.)

따라서, Security가 관리하는 ROLE은 로그인 사용자들을 구분하기 위한 용도로 사용되지 않는다.(이 때문에 ROLE.USER 만 사용한다.) 

이렇게 생각하면 SSOC 사용자들은 Security에서 인증을 성공하고 인가를 실패할 경우가 발생하지 않는다. 이제 와서 조금 허무하지만, 결론적으로 우리 서비스에서 **AccessDeniedHandler가 작동할 케이스는 없다.**

다만, 추후 요구사항 변화와 시큐리티 내부 구현 사항을 고려했을 때 해당 AccessDeniedHandler의 구현체는 작성해 두었다.

이러한 사항으로 보았을 때 AccessDeniedHandler이 수행하는 인가실패에 대한 예외책임은 결국 Club Role에 대한 검증을 진행하는 Spring MVC 컨트롤러에서 갖는 것이 적절하다고 보았다. 현재 상황에서는 AccessDeniedHandler는 작동할 경우가 없겠지만, 만약 작동한다하면 인가 예외응답 생성 책임을 갖는 ClubRoleException과 동일하게 MVC의 @ControllerAdvice에서 수행되는 것이 더 적절해 보였다.

그렇다면 [`AuthenticationException`](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/core/AuthenticationException.html)는? **AuthenticationEntryPoint 여기서 처리하는것이 맞을까? 이 또한 그렇다고 생각한다. 위에서 살펴보았듯이, AuthenticationEntryPoint는 인증 예외이다. 따라서 Filter 내부에서 발생한 예외이자, Security 구현체에서 권장되는 방식으로 AuthenticationEntryPoint가 응답 책임을 갖는 것이 더 적절하다.**

Spring Security의 인증/인가 예외는 DispatcherServlet 이전의 필터 단계에서 발생하기 때문에, 단순히 @ExceptionHandler나 @ControllerAdvice만으로는 잡히지 않습니다. 그래서 Spring Security 6.1+에서는 다음과 같은 통합 예외 처리 패턴을 권장합니다:

1. **필터(예: AuthenticationEntryPoint, AccessDeniedHandler)에서 예외 발생 시 HandlerExceptionResolver로 위임**
    - 필터에서 예외가 발생하면, 직접 response에 에러를 쓰는 대신, Spring의 HandlerExceptionResolver(보통 DefaultHandlerExceptionResolver)를 호출합니다.
    - 이때, HandlerExceptionResolver는 예외를 DispatcherServlet까지 전달하여, @ControllerAdvice에 정의된 GlobalExceptionHandler가 예외를 처리할 수 있게 합니다.
2. **@ControllerAdvice + @ExceptionHandler에서 실제 예외 처리**
    - 위임된 예외는 GlobalExceptionHandler에서 일관된 방식으로 처리할 수 있습니다.
    - 예를 들어, 인증 실패 시 401, 인가 실패 시 403 등의 커스텀 JSON 응답을 반환할 수 있습니다.

이 패턴은 Baeldung 등 주요 Spring 커뮤니티와 공식 문서, 그리고 여러 실무 예제에서 소개되고 있습니다.

실제 구현 예시는 다음과 같습니다:

결론을 먼저 얘기하자면, Security의 예외처리 엔트리 포인트인, AuthenticationEntryPoint에서 예외를 HandlerExceptionResolver로 넘겨서, @ControllerAdvice에서 처리할 수 있게 우회하는 방법으로 예외를 통일성 있게 @ExceptionHandler에서 처리하자는 의미이다.

### 왜그럴까?

these **exceptions are thrown by the authentication filters behind the *DispatcherServlet* and before invoking the controller methods,***@ControllerAdvice* won’t be able to catch these exceptions.

***DispatcherServlet이 컨트롤러를 호출하기 전에, 먼저 인증 필터들이 실행되기 때문에, 이 인증필터에서 발생하는 예외들을** @ControllerAdvice가 잡을 수 없기 때문이다.
*****

### 근거

1.  Spring Security의 인증 실패가 컨트롤러에 도달하기 전에 발생하기 때문

1. 인증/인가 실패는 비즈니스 로직(컨트롤러)과 무관한 보안 이슈입니다.
2. AuthenticationEntryPoint에서 처리하면, 보안 로직과 비즈니스 로직이 명확히 분리되어 코드가 깔끔
3.  **프레임워크의 기대 동작**
공식문서에 따르면, Spring Security는 AuthenticationEntryPoint에서 예외 응답을 처리할 것을 기본 전제로 동작합니다. 이 구조를 따르는 것이 유지보수와 확장성 측면에서 유리합니다.

### 결론 - 접근위치를 기반으로

1. 인증실패
    1. **인증 실패는 Security FilterChain 안에서 처리되므로, 여기서 바로 JSON 응답을 만들어서 내려보내는 것**
    - AuthenticationEntryPoint로 들어오는 인증(**Authentication)**실패 응답은 Filter 단에서 직접 응답.(AuthenticationException
    → 401 Unauthorized)
    - 상황 토큰없음,만료,위조
2. **AccessDeniedHandler에서는 직접 응답하지 않고, Spring의 HandlerExceptionResolver를 통해 @ControllerAdvice로 위임**해 처리하는 것이 유지보수성과 응답 일관성을 높입니다.
- AccessDeniedHandler로 들어오는 인가(**Authorization)** 실패(인증은 되었을때 권한이 없음) 응답은 MVC까지 넘어왔기 때문에 **MVC 예외 처리기 (@ControllerAdvice)로 위임 처리** (AccessDeniedException
 → 403 Forbidden)
    - 권한부족시, Security Filter 이후 (HandlerInvoker 직전)에 발생한다.

### 근거

- 물론 나는 접근 위치를 기반으로 해당 결론을 도출했지만, 시큐리티에서 발생하는 예외인 특성상 인증/인가 실패 둘다 MVC로 넘어오기전 필터에서 처리하는 것이 더 적절해 보일 수 잇다.(이는 기준차이인것으로 보인다. - baeldung에서도 2가지 방식 모두를 예시로 들고 있다.)
- 하지만, 우리 프로젝트에서는 시큐리티를 이용하는 인가 방식 말고, AOP로 직접 구현한 @HasRole 체크 인가과정이 있고 해당 인가 검증 과정은 MVC내부에서 일어나기에 이와 같은 맥락에서 **@ControllerAdvice에서 처리하는 것이 적절해 보인다.**

### 결론

둘다 Security에서 발생하는 예외임에도, 인증, 인가로직을 수행하는 지점이 달랐고, 그래서 응답하는 지점이 다르다는 점에서 예외처리에 대한 책임이 분리되었다는 느낌을 받았다. 현재 서비스 요구사항에 맞게 통일성을 지키다 보니, 예외발생 지점(Security)에 초점을 맞추지 않고, 인증/인가를 중점으로 예외처리 응답지점을 다르게 했다는 점에서 어느정도 트레이드 오프가 발생한것 같다. 

이에 대해 미쳐 생각하지 못했던 의견이나 잘못된 지점에 대한 피드백은 언제나 환영합니다!