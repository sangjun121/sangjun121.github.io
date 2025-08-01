---
layout: post
title: "Spring Security Exception Handling: Should GlobalExceptionHandler Handle Filter Exceptions?"
subtitle: "A deep dive into Spring Security filter chain exception responsibility"
author: Sangjun Cho
categories: Spring SSOC
lang: en
banner:
  image: ../assets/images/springsecurityexception/securityExceptionHandling003.png
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold;"
  subheading_style: "color: gray"
tags: Spring Security SSOC
comments: true
sidebar: []
korean_version: /spring/security/ssoc/2025/07/24/spring-security-exception
---
<br>

> 📝 **Note:** I originally wrote this post [in Korean](/spring/security/ssoc/2025/07/24/spring-security-exception.html) and translated it into English.     **English isn’t my first language, so please feel free to point out any grammar issues or awkward expressions!**

## Current Situation

Our service SSOC currently implements login logic and JWT verification logic in Spring Security filters. 

When we tried to handle exceptions occurring in Security filters using the GlobalExceptionHandler with @ControllerAdvice, the exceptions weren't reaching the controller, so we couldn't send the designated response values.

> These exceptions are thrown by the authentication filters behind the *DispatcherServlet* and before invoking the controller methods, *@ControllerAdvice* won't be able to catch these exceptions.

**This is naturally because Security filters execute before the DispatcherServlet calls the controller, so exceptions occurring in these filters cannot be caught by @ControllerAdvice.**

Therefore, Security filter exceptions go through AuthenticationEntryPoint (authentication exception entry point) and AccessDeniedHandler (authorization exception entry point) provided by Security. We need to write logic in these handlers to determine how to handle exceptions when they occur.

**In this context, with @ControllerAdvice existing inside MVC,** I want to record the considerations about whether to delegate exception response responsibility to the GlobalExceptionHandler from each entry point, or to provide exception responses directly from the entry point at the Filter level.

First, let's look at some basic knowledge to understand the implementation situation below.

## Exception Handling and Processing Sequence in Spring Security Filter Chain

[Spring Security Official Documentation - Handling Security Exceptions](https://docs.spring.io/spring-security/reference/servlet/architecture.html#servlet-exceptiontranslationfilter)

Reading the Handling Security Exceptions part of the official documentation, you can see how Security's implementation handles exceptions occurring within the Security Filter Chain. I want to understand this sequence first and continue the discussion.

### What Exceptions Occur in Security Filter Chain and Who Handles Them?

When authentication or authorization-related problems occur in Spring Security, exceptions like AuthenticationException (authentication failure) and AccessDeniedException (authorization failure - no permission) are typically thrown. At this point, Security's ExceptionTranslationFilter doesn't simply throw the exception, but converts it into appropriate HTTP responses (e.g., 401 Unauthorized, 403 Forbidden) to inform the user.

Let's look at the processing sequence for each exception type using the pseudo code and sequence diagram of ExceptionTranslationFilter provided in the official documentation.

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

### 1. AuthenticationException (Authentication Exception) Sequence

Let's assume an unauthenticated user tries to access /my-page.

1. An unauthenticated request causes an AuthenticationException within the filter, and the startAuthentication method corresponding to step 2 in the diagram is executed.
2. After entering startAuthentication, it initializes any existing SecurityContextHolder.
3. It saves the current request for /my-page path in RequestCache.
4. AuthenticationEntryPoint informs the client that "authentication is required, i.e., login is needed" (401 Unauthorized) or performs a redirect to the Login page.

### 2. AccessDeniedException (Authorization Exception) Sequence

Authorization errors occur when authenticated users lack sufficient permissions. Looking at the pseudo code above, for authenticated users with insufficient permissions, accessDenied() is executed.

As shown in step 3 of the diagram, AccessDeniedException invokes the AccessDeniedHandler.

**In summary, Spring Security's ExceptionTranslationFilter delegates AuthenticationException or AccessDeniedException occurring within the Security Filter Chain to AuthenticationEntryPoint or AccessDeniedHandler respectively to handle exception responses.**

## Responsibility for Security Exception Responses Found in Official Documentation

Back to our main concern: should we write exception responses directly in AuthenticationEntryPoint and AccessDeniedHandler, or should we delegate responsibility to @ControllerAdvice implemented in MVC? Was there an answer to this in the official documentation?

[Spring Security Official Documentation - Handling Security Exceptions](https://docs.spring.io/spring-security/reference/servlet/architecture.html#servlet-exceptiontranslationfilter) contains the following statement:

> The [ExceptionTranslationFilter](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/web/access/ExceptionTranslationFilter.html) allows translation of [AccessDeniedException](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/access/AccessDeniedException.html) and [AuthenticationException](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/core/AuthenticationException.html) into HTTP responses.

As such, the ExceptionTranslationFilter → AuthenticationEntryPoint, AccessDeniedHandler structure in Spring Security allows putting filter exceptions into HTTP responses.

**Also, the default implementations of AuthenticationEntryPoint and AccessDeniedHandler are designed to directly return HTTP responses when exceptions occur.**

![test.png](/assets/images/springsecurityexception/securityExceptionHandling002.png)
*AuthenticationEntryPoint impl*

![test.png](/assets/images/springsecurityexception/securityExceptionHandling003.png)
*AccessDeniedHandler impl*

This suggests that the responsibility for exception responses within filters lies within Spring Security, not Spring MVC.

## Processing Exception Responses at Spring Security Filter Level is Faster and Safer: Based on Request Flow

Based on request flow, processing exception responses directly at the filter stage like Spring Security's AuthenticationEntryPoint or AccessDeniedHandler is generally faster and safer than passing requests to MVC and handling them in @ControllerAdvice.

Looking at the diagram
![test.png](/assets/images/springsecurityexception/securityExceptionHandling004.png)

The ExceptionTranslationFilter, which is part of FilterChain/SecurityFilterChain, already has HttpServletRequest/Response created and passed by the Servlet Container, so exception entry points (entry points/handlers) can send responses directly to clients. This doesn't require access to the Spring MVC layer and can send responses directly to clients.

**However, if exception entry points delegate exception responsibility to @ControllerAdvice, requests would go one layer deeper into MVC for responses.** Just looking at this request flow, sending exception responses from Security filters seems healthier.

## So, Is Delegating Exception Response Responsibility to MVC's @ControllerAdvice Not Recommended?

**Actually, it's fine to do so.**

### Evidence 1. Spring Security Official Reference

Even after confirming the above content, that statement doesn't mean exception responses must only be handled within Spring Security. The question of whether delegating this response responsibility to MVC is safe remained. The answer to this can be found indirectly in the Spring Reference documentation:

[Spring Security Official Reference](https://docs.spring.io/spring-security/site/docs/4.2.15.RELEASE/reference/htmlsingle/#exception-translation-filter)

![test.png](/assets/images/springsecurityexception/securityExceptionHandling005.png)

![test.png](/assets/images/springsecurityexception/securityExceptionHandling006.png)

Reading this reference, for AuthenticationEntryPoint, the recommended handling method indicates implementing components to redirect to perform login or execute the authentication mechanism used in our application.

**However, for AccessDeniedHandler, it additionally specifies the method of passing to MVC controllers.**

To speculate about this difference, it can be based on the difference in entry timing between AuthenticationEntryPoint and AccessDeniedHandler.

First, consider the entry timing of AuthenticationEntryPoint. It enters after an authentication exception (AuthenticationException) occurs. AuthenticationException was caught within Security filters due to login failure, SpringSecurityContext wasn't initialized, and hasn't entered MVC yet. For this reason, passing to Controllers within MVC doesn't seem recommended.

**(Digging deeper, if it's the first request, the HttpServlet instance itself might not have been created yet when AuthenticationEntryPoint is entered.)**

Conversely, considering the entry timing of AccessDeniedHandler, authentication was successful, SpringSecurityContext was initialized, but after entering MVC, an exception occurred due to annotations like @HasRole on Service methods, so AccessDeniedHandler was invoked. Therefore, it had already entered MVC, and accordingly, the method of delegating to @ControllerAdvice within MVC was also explained.

**In conclusion, Spring Security basically provides default handling for security-related exceptions at the Filter level, but for AccessDeniedHandler, it's designed so developers can delegate response handling to MVC (@ControllerAdvice) as needed.**

### Evidence 2. Other Servlet Filters at the Same Level as Security Filter Also Respond to Exceptions Through MVC

While pondering this question, I was reminded that various filters other than Spring Security operate together within Tomcat's FilterChain, which includes the Security Filter Chain.

In other words, Security filters are in the same exception handling mechanism as other general filters located at the same layer.

Looking at the diagram again:

![test.png](/assets/images/springsecurityexception/securityExceptionHandling004.png)

**So, if we check how other filters at the same level handle exceptions, couldn't we know where and how Spring recommends handling exceptions?**

When exceptions occur in Servlet Container or Filter, WAS passes the request to /error for exception handling, and exceptions enter BasicErrorController through DispatcherServlet. Ultimately, BasicErrorController has the responsibility for exception responses. (However, this assumes there's no GlobalExceptionHandler implemented with @ControllerAdvice.)

**In conclusion, other filters also have their ultimate response responsibility at the MVC layer when exceptions occur. This alone shows that the basis for Spring Security having to finish exception handling only within filters is weak.**

## Conclusion. Implementation Direction - Based on Occurrence Timing and Service Requirements

Based on the lengthy explanation above, I reached the following conclusion:

First, following the roles and responsibilities of AuthenticationEntryPoint and HandlerExceptionResolver as explained in Security's official documentation and default implementations, i.e., "generate exception responses and inform clients," but deciding that @ControllerAdvice in MVC should take responsibility for authorization exception responses according to our service requirements.

Ultimately, there was no clear specification about which is preferred, but I decided based on exception occurrence timing and our service SSOC's permission authentication method as follows:

> Authentication exceptions ([AuthenticationException](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/core/AuthenticationException.html)) return responses directly from AuthenticationEntryPoint, while authorization exceptions ([AccessDeniedException](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/access/AccessDeniedException.html)) delegate response responsibility to @ControllerAdvice through HandlerExceptionResolver.

Actually, service requirements were most decisive. Let's look at this.

### Service Requirements - Authorization Logic for Internal Club Permissions Implemented with AOP Already Exists in MVC

Looking at SSOC service member requirements, users are classified as follows:

![test.png](/assets/images/springsecurityexception/securityExceptionHandling007.jpg)

Our service distinguishes between logged-in and non-logged-in members for applicants and administrators, and administrators are managed in DB tables with internal custom Roles of President and Member. This internal custom Role is referred to as ClubRole.

Why? Users who need to log into SSOC are administrators (Admin). These administrators can belong to multiple clubs and have permissions within each club, so it's impossible to fix such users to one specific ROLE.

Therefore, the ROLE managed by Security is not used to distinguish logged-in users. (This is why Security only has ROLE.USER for verification. Ultimately, all logged-in members are ROLE.USER, and detailed permissions are determined by internal custom ROLEs.)

Thinking this way, SSOC users don't fail authorization after succeeding authentication in Security. Coming to this point is somewhat anticlimactic, but in conclusion, there are no cases where AccessDeniedHandler would operate in our service.

So where is the logic for verifying this internal custom ROLE of President and Member implemented? It's implemented as Spring AOP's Before Advice to verify before Controller entry. Since it's an exception occurring within MVC, @ControllerAdvice has responsibility for exception responses from ClubRole authorization failures.

**In conclusion, looking at authentication/authorization, i.e., role timing, having authorization failure exceptions managed once in MVC seemed more unified. Therefore, in the current situation, AccessDeniedHandler wouldn't operate, but if it did, delegating to MVC's HandlerExceptionResolver, which has responsibility for generating authorization exception responses in the same context as ClubRoleException, seemed more unified.**

## Reflection

The discussion about who should have responsibility for exception handling within filters became lengthy and disorganized. However, I was able to understand who has responsibility for existing implementations based on where exceptions occur in user request flow, and had an opportunity to organize the overall exception handling sequence within applications.

What still concerns me is whether it's appropriate to customize against default implementation recommendations based on service requirements, and ultimately the advantages gained from this don't seem that attractive, which is somewhat disappointing.

Feedback on points I may not have considered or incorrect aspects is always welcome!