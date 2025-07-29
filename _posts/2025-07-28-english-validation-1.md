---
layout: post
title: "How Should Validation Be Implemented? Part 1"
subtitle: "Part 1: Types of Validation and Layer-specific Validation Responsibility Separation"
author: Sangjun Cho
categories: Spring Validation
lang: en
banner:
  image: ../assets/images/validation/validation001.png
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold;"
  subheading_style: "color: gray"
tags: Spring Validation
comments: true
sidebar: []
korean_version: /spring/validation/2025/07/28/validation-1.html
---

> 📝 **Note:** I originally wrote this post [in Korean](/spring/validation/2025/07/28/validation-1.html) and translated it into English.     **English isn’t my first language, so please feel free to point out any grammar issues or awkward expressions!**

## Current Situation

Currently, each domain module is implemented individually by team members, and during this process, **validation logic is inconsistently scattered across various layers**. This has led to the following issues:

- Missing and duplicated validation logic
- Validation responsibilities located in different layers for different domains
- Unclear validation responsibilities making maintenance difficult

To address these issues, **we want to identify what types of validation are absolutely necessary by focusing on request flow** and **establish clear criteria for which layer and which object should handle each validation**.

Through this, we aim to synchronize the team's validation approach and write unified code.

## Let's Examine the Types of Validation

The basic validation logic needed can be divided into four types:

### 1. Form and Constraint Validation

- Definition: Validating whether input values have valid formats or data types, checking value ranges, counts, duplication, and other basic conditions
- Example cases: Email format validation, checking if phone numbers are numeric, length validation, age between 0 and 120, database Description field not exceeding 500 characters
- Methods: @Valid, @Pattern, @NotBlank, @NotNull, database table field constraints
- Location: Request DTO, Controller, Entity

### 2. Business Rule and State Validation

- Definition: Validation to ensure domain internal rules and valid object states
- Example cases: Applications past deadline cannot be modified. Administrators cannot create duplicate evaluations for the same applicant. Administrators cannot have duplicate permissions within a club. (State validation example:) Only administrators can view expired announcements. (State validation example:) Verify if the object belongs to the logged-in user.
- Methods: Conditional validation and exception throwing → ExceptionHandler returns exception response
- Location: Domain/Service (Should be performed within domain objects in principle, but can be implemented in Service logic when necessary)

### 3. External Dependency-based Validation

- Definition: Validation related to external systems such as DB, external APIs, files, external domains
- Example cases: Verifying Refresh Token validity by querying RefreshToken table. Verifying club internal permissions by querying ClubRole table. Checking if email already exists during user registration.
- Methods: Database queries
- Location: Service

### 4. Authorization Validation

- Definition: Validating whether the current user making the request is authenticated (logged in) and authorized (has appropriate permissions)
- Example cases: Unauthenticated users cannot access /recruitment path (authentication failure). Club members cannot create club announcements (only owners can) (authorization failure)
- Methods: Security Filter, AOP (Custom Aspect) for custom authorization validation logic
- Location: Security Filter Exception EntryPoint (for authentication exceptions), AOP validation → @ControllerAdvice for exception response generation (for authorization exceptions)

Here, types 3 and 4 are structures where the functionality itself performs validation, and type 4 authentication/authorization validation is managed through SecurityFilter and AOP.

Therefore, this document focuses on types 1 and 2 validation that need to be considered during actual code implementation.

## Examining Project Server Architecture Flow

To easily understand the following explanation, I've organized the request flow within the server architecture.

![test.png](/assets/images/validation/validation00103.png)
- Blue arrows: Request entry flow
- Orange arrows: Response return flow
- Red arrows: External domain reference flow

If the following explanation feels complex, please refer to the diagram above. I hope this diagram helps in understanding the content.

## So, What Validation Responsibilities Do Each Object Have?

Returning to the main topic, let's examine what validation responsibilities the objects within the above architecture have. The objects below are organized according to request processing flow.

### 1. ReqDTO/Controller

ReqDTO/Controller is the initial entry point for requests, and ReqDTO only needs form and constraint validation.

**This layer does not perform business rule-related validation logic**. The reason is that it would duplicate the business rule validation logic written in the domain, and modifying duplicated logic can lead to human errors. **Therefore, it only validates basic value validity** and passes business rule validation responsibility to the domain.

- Example: ReqDTO validation through @Valid (`@NotBlank`, `@Pattern`, `@Size`)
  ![test.png](/assets/images/validation/validation00101.png)
  ![test.png](/assets/images/validation/validation00102.png)

### 2. Service

The service layer basically depends only on the domain layer, calling domain objects and {domain}RepositoryInterface to connect domain and infrastructure, coordinating use case-level logic. (In our architecture, RepositoryInterface belongs to the Domain Layer.)

Service validation responsibilities are limited to the following two:
>1. Validation needed when connecting with external domains we depend on
>2. Validation of the state of loaded objects

The important point here is that business rule validation should be minimized. Business rule validation is basically the responsibility of Domain objects, and Service only performs the coordinator role.

#### Example 1. Service Validation Without External Domain Dependencies (Evaluation Information Query API)

For example, suppose we query "Evaluation" information of a logged-in user's "Application". The service function pseudocode is as follows:

```java
//1. Query "Application" type "Evaluation" with input applicant id and evaluator id
evaluation = evaluationRepository.findByApplicantIdAndEvaluatorId(applicantId, evaluatorId)

//2. Validate if the Evaluation domain type is "Application" (state validation)
if evaluation.type != EvaluationType.APPLICATION:
    throw new InvalidEvaluationTypeException()

//3. Convert to Response and return
return EvaluationResponse.from(evaluation)
```

The important point in the above example is that business rule validation of the Evaluation object is handled by the internal validate() method within Evaluation, and Service is only responsible for state checking needed for that use case.

However, the above example doesn't depend on external domains. What about cases that access external domains? Let's look at the example below.

#### Example 2. Service Validation Depending on External Domains (Permission Grant API)

Consider an API that grants **OWNER** **permission** for the **Programming** **club** to logged-in user **Hong Gil-dong**. This is a request coming into the ClubRole domain, and the service function pseudocode is as follows:

```java
//1. Load Club Domain Object with clubId
club = clubRepository.findById(clubId)

//2. Load Admin Domain Object with AdminId
admin = adminRepository.findById(adminId)

//3. Create new ClubRole object with static factory method ClubRole.initialize()
//   based on Club and Admin
clubRole = ClubRole.initialize(club, admin)

//4. Save with ClubRoleRepositoryInterface.save()
clubRoleRepository.save(clubRole)

//5. Respond with success/failure state and necessary data in resDTO
return ClubRoleResponse.of(success = true, data = clubRole)
```

In this case too, business validation for external domains Club and Admin is not performed. This is because they are objects that have completed validation internally at creation time.

**Also, the responsibility to check if Club and Admin objects retrieved from DB exist is not with Service.** That responsibility is performed by the infra layer, ClubRepositoryImpl and AdminRepositoryImpl, so domain objects that enter Service can be trusted.

**In summary, service logic only needs to be responsible for object state validation based on use cases.**

This is actually a natural principle. Service plays the role of calling and combining external layers, and domain objects that reach that point have already completed necessary validation. Therefore, **Service only needs to check the necessary state for the use case.**

### 3. Domain Object

Domain objects perform core business logic. Therefore, they basically have responsibility for business rule validation.

Domain Object creation timing can be divided into two main cases:

>1. Object creation with initialize() in request → infra flow
>2. Object creation with @builder in infra → response flow

Both methods of creating objects must necessarily involve validation. That is, creation methods must include validate() methods internally, requiring business rule validation.

Accordingly, Domain Object conventions can be briefly explained as follows:

> 1. validate() call is mandatory within initialize() method
> 2. validate() call is mandatory along with builder call within customBuilder
> 3. validate() is implemented by inheriting the Validatable interface

As the core object of validation, detailed content about actual code implementation will be covered in the next post. Through that post, I plan to explain how to implement ideal Domain Objects that guarantee integrity and immutability.

### 4. Value Object

Value Object is an object that represents immutable values, mainly used in the Domain Layer in our service.

Like DTOs, VOs need form/constraint validation to prevent wrong values from being created as objects. This is performed by calling validate() within the static factory method of() for object creation.

Also, since VOs guarantee validity at object creation time, no separate validation is needed after creation. (Projection objects used in the Infra layer are the same.)

### 5. {domain-name}RepositoryInterface

**RepositoryInterface is persistence access abstraction included in the domain layer.**
Repository in domain layer? Persistence access abstraction? While written in difficult terminology, it's actually simple.

First, let's look at one of our architecture principles:
![test.png](/assets/images/validation/validation00104.png)

> **The Domain layer should focus only on business logic and have no dependencies on external layers.**

(This can be understood more easily by looking at the architecture structure attached above.)

**To follow this principle, RepositoryInterface uses domain objects as parameters and return types.** And repositoryImpl (infra layer) that implements this uses Mapper internally to map with Entity, which is a DB object. In other words, RepositoryInterface is an adapter connecting Domain Layer and Infra Layer.

Returning to the main topic, does RepositoryInterface have validation responsibilities?
There are two important points here:

1. Validation responsibility for Domain objects belongs to Domain and Service.
2. Validation responsibility for Entity belongs to the infra layer. (Covered in Entity section below.)

For these two reasons, **RepositoryInterface has no validation responsibilities whatsoever. RepositoryInterface is simply a conduit that delivers and returns validated objects.**

This leads to the following design principle:

> Since validation during DB queries is handled by RepositoryImpl (Infra layer) and there's a guarantee that already validated Domain Objects are input/returned, **RepositoryInterface return values cannot be Optional<>.**

### 6. {domain-name}RepositoryImpl

Now we enter the infra layer.

RepositoryImpl implements actual persistence logic based on JPA (calls) and implements RepositoryInterface to connect domain and Entity.

Validation logic that should be involved in the Infra layer consists of two types:

> 1. Entity state validation after DB query (e.g., Does the Entity exist? Is it soft deleted?)
> 2. Validation based on DB constraints during DB query/save

**RepositoryImpl has responsibility for validation #1 and Entity has responsibility for validation #2.**

Let's first look at validation #1 for Entity state. **State validation after DB query is RepositoryImpl's responsibility. This includes the following validity validation:**

- Validation if the object itself exists (Null-Check)
- Validation if it's in soft deleted state
- Validation if it's in other abnormal states

Example code for this is as follows:

```java
AdminEntity adminEntity =
        adminJpaRepository
            .findById(evaluation.getEvaluatorId())
            .filter(entity -> !entity.getDeleted())
            .orElseThrow(() -> new EntityNotFoundException("AdminEntity not found or deleted"));
```

As shown in the code, validation should be written for AdminEntity retrieved by adminJpaRepository to check if it's not `Optional.Empty()` and for Entity value validity and state like `.filter(entity -> !entity.getDeleted())`. (Because of this, RepositoryInterface function return values examined above don't need to be expressed as Optional.)

**RepositoryImpl** also doesn't perform business rule validation.

### 7. Entity

Now let's continue with constraint validation #2 and examine why Entity has responsibility for validation #2.

First is constraint validation. Constraint validation #2 is sufficient by validating integrity with DB constraints. Therefore, validation can be performed by adding field annotations and table constraint conditions within Entity.

Then, isn't form validation logic needed?

**Actually, Entity's DB constraint conditions mentioned above cannot completely guarantee form validation.** This is because DB constraint conditions cannot perform structure/format validation of field values, which is form validation. For example, DB email record Length can be validated with Entity constraint conditions, but format validation like [example@example.com](mailto:example@example.com) cannot be validated with constraint conditions.

Then, should form validation logic also be written in Entity?

From the conclusion, I don't think so.

1. **Entity is a simple persistence model that reflects DB tables.**
    
    Entity is simply a data model mapped to DB tables and performs the core role of JPA's persistence layer.
    Therefore, Entity should focus only on persistence area roles. If validation logic is mixed in, roles become unclear and testing becomes difficult.
    
2. **Entity is structured to handle only already trusted values.**
Let's think about when Entity is created.

    **Domain → Entity**
    At this point, form/constraint validation has already been performed through DTO and VO, and Domain object is also in a validated, trustworthy state through internal functions.

    **DB → Entity**
    In this case too, it's a trustworthy state as it's a value directly returned from DB.

**Ultimately, Entity has responsibility for DB-related constraint validation but doesn't need to perform form validation.**

### 8. Mapper
Mapper is a static utility method for object conversion. Therefore, validation logic doesn't need to be written.

### 9. JpaRepository
Since it only performs simple CRUD and query DSL provision roles and only accesses the database, this also doesn't need validation logic. Values returned through this function enter RepositoryImpl, meaning RepositoryImpl has validation responsibility.

### Reference. Doesn't Response DTO Need Validation?

Finally, is it okay for Response DTO, which is the response value, not to perform validation?

**Response DTO is generally not a validation target.**
This is because it's created with valid values that have already gone through domain logic within the system and can be trusted, making validation unnecessary.

However, review is needed from the perspective of output data reliability and security. For example, there might be cases like removing sensitive information that shouldn't be exposed for security reasons. But this is a situation that can occur when returning Entity itself to clients.

Since the purpose of creating ResponseDTO is ultimately to defend against this, ResponseDTO itself is sufficient and I think separate validation logic is unnecessary.

## Retrospective

We took time to define which layer should have validation responsibilities based on our service architecture. If the service architecture differs from this, there might be some differences, but ultimately deciding who performs validation based on each layer's responsibilities and roles would be the key.

Feedback on points I may not have considered or incorrect aspects is always welcome!

### References

[How I Use Kotlin - Kakao Pay Tech Blog](https://tech.kakaopay.com/post/katfun-joy-kotlin/)