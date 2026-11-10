**\_\_0Software Requirements  Specification** 

**for** 

**TOR Checker**

**Version 0.8**

**Prepared by** 

**Department of Software and Knowledge Engineering**  
**Kasetsart University**

								**August 2026**

# **Table of Contents** {#table-of-contents}

[**Table of Contents	1**](#table-of-contents)

[**1\. Introduction	3**](#1.-introduction)

[1.1 Purpose	3](#1.1-purpose)

[1.2 Document Conventions	3](#1.2-document-conventions)

[1.3 Product Scope	3](#1.3-product-scope)

[1.4 Intended Audience	4](#1.4-intended-audience)

[1.5 References	4](#1.5-references)

[**2\. Overall Description	6**](#2.-overall-description)

[2.1 Product Perspective	6](#2.1-product-perspective)

[2.2 Product Functions	7](#2.2-product-functions)

[2.3 User Classes	7](#2.3-user-classes)

[2.4 Operating Environment	8](#2.4-operating-environment)

[2.5 Design and Implementation Constraints	8](#2.5-design-and-implementation-constraints)

[2.6 Assumptions and Dependencies	9](#2.6-assumptions-and-dependencies)

[**3\. External Interface Requirements	9**](#3.-external-interface-requirements)

[3.1 Stakeholder Identification and Roles	9](#3.1-stakeholder-identification-and-roles)

[3.2 Hardware Interfaces	10](#3.2-hardware-interfaces)

[3.3 Software Interfaces	11](#3.3-software-interfaces)

[3.4 User Interfaces	12](#3.4-user-interfaces)

[3.5 Communications Interfaces	17](#3.5-communications-interfaces)

[**4\. Functional Requirements	18**](#4.-functional-requirements)

[4.1 Search & Browse	18](#4.1-search-&-browse)

[4.2 AI Summary & Fairness	18](#4.2-ai-summary-&-fairness)

[4.3 Vendor Account & Matching	19](#4.3-vendor-account-&-matching)

[4.4 Admin Operation	20](#4.4-admin-operation)

[4.5 Data Ingestion Pipeline	21](#4.5-data-ingestion-pipeline)

[**5\. Non-Functional Requirements	22**](#5.-non-functional-requirements)

[5.1 Performance Requirements	22](#5.1-performance-requirements)

[5.2 Security Requirements	22](#5.2-security-requirements)

[5.3 Usability Requirements	22](#5.3-usability-requirements)

[**6\. Other Requirements	23**](#6.-other-requirements)

[6.1 Database Requirements	23](#6.1-database-requirements)

[6.2 Internationalization Requirements	23](#6.2-internationalization-requirements)

[6.3 Data Model	23](#6.3-data-model)

[**Appendix A: Glossary	27**](#appendix-a:-glossary)

[A1. Procurement & Domain Terms	27](#a1.-procurement-&-domain-terms)

[A2. AI & Data Analysis Terms	28](#a2.-ai-&-data-analysis-terms)

[A3. Technical & Architectural Terms	29](#a3.-technical-&-architectural-terms)

[A4. Requirements Engineering Terms	30](#a4.-requirements-engineering-terms)

**Revision History** 

| Name | Date | Reason For Changes | Version |
| :---- | :---- | :---- | :---- |
| **Pakorn, Paranyu, Karnpon** | **20 August 2026** | **Initial creation**  | **0.1** |
| **Pakorn, Paranyu, Karnpon** | **27 August 2026** | **First Revise** | **0.8** |

# 

# **1\. Introduction** {#1.-introduction}

## **1.1 Purpose** {#1.1-purpose}

This Software Requirements Specification (SRS) defines the functional and non-functional requirements for a web-based platform that aggregates, searches, and analyzes software-related Terms of Reference (TORs) published by government agencies in Bangkok.

The system addresses the difficulty of finding and comparing TOR documents that are distributed across multiple sources, primarily the Electronic Government Procurement (e-GP) system and agency-specific websites. The platform transforms unstructured procurement information into structured and searchable data, provides AI-assisted summarization of key requirements, qualifications, and evaluation criteria, and applies AI-assisted fairness and anomaly analysis to help identify TORs with potentially biased or restrictive specifications. The system also helps software vendors identify procurement opportunities that match their capabilities.

This document serves as a reference for system development, testing, validation, and evaluation.

## **1.2 Document Conventions** {#1.2-document-conventions}

This Software Requirements Specification (SRS) document follows standard IEEE SRS conventions.

All functional requirements are uniquely identified using the prefix FR- followed by a numeric identifier (e.g., FR-1, FR-2). Each functional requirement statement uses the keyword "shall" to indicate a mandatory system behavior.

Non-functional requirements use the prefix NFR- followed by a numeric identifier (e.g., NFR-1, NFR-2) and specify quality attributes, constraints, and system-wide properties such as performance, security, usability, reliability, and compatibility.

Feature names are written in bold headings and are used to group related functional requirements. Numbered sections and subsections are used to organize the document logically.

No explicit priority levels are assigned to individual functional requirements. All requirements specified in this document are considered mandatory unless explicitly stated otherwise, as the project scope was intentionally limited to the core features required for the platform to function.

## **1.3 Product Scope** {#1.3-product-scope}

The system provides a centralized platform for collecting and analyzing software-related TORs from Bangkok-based government agencies. 

| The platform consists of three core components: |  |
| :---- | :---- |
| 1\. | Aggregation & Search \- Collects TOR information, initially from e-GP, and parses relevant information from documents into a structured database. The system generates AI-assisted summaries of key requirements, qualifications, and evaluation criteria for each TOR. Users can search and filter TORs by keywords, agency, budget, technology stack, project type, and bidding deadline. This search functionality is publicly accessible, allowing citizens, journalists, and watchdog organizations to search, compare, and review publicly available TOR information without requiring an account. |
| 2\. | AI Fairness and Anomaly Analysis \- Groups similar TORs using similarity analysis and identifies potential anomalies, such as significant budget deviations, unusually narrow eligibility requirements, brand-locked specifications, or unusually short bidding periods. These results are presented as signals for review and do not constitute accusations of wrongdoing. |
| 3\. | Vendor Dashboard \- Allows software vendors and freelancers to create profiles containing information such as their technology stack, budget range, and previous project experience. The system can match vendors with potentially suitable open TORs and provide saved searches and email notifications for new matching opportunities. |

## **1.4 Intended Audience** {#1.4-intended-audience}

This document is intended for:

| Audience | Description |
| :---- | :---- |
| Project Manager / Product Owner | Officials who will review and approve the requirements |
| Development Team | Who will design and implement the system |
| QA / Test Engineers | Who will derive test cases from the functional requirements, non-functional requirements, and use cases in this document |
| UI/UX Designer | Who will design the screens described in Section 3, External Interface Requirements |

## **1.5 References** {#1.5-references}

* Electronic Government Procurement (e-GP) \-  Government procurement information and TOR documents  
* Bangkok Metropolitan Administration (BMA) \- Procurement announcements and agency-specific TOR information  
* Personal Data Protection Act (PDPA), B.E. 2562 (2019) \- Requirements related to personal data protection  
* IEEE \- style SRS templat

# **2\. Overall Description** {#2.-overall-description}

## **2.1 Product Perspective** {#2.1-product-perspective}

The system is a web-based platform designed to aggregate, search, and analyze software-related Terms of Reference (TORs) published by government agencies in Bangkok.

The system consists of a web frontend, backend services, database, data collection pipeline, and AI analysis services. It integrates with external sources and services, including:

* Next.js  \- Web application frontend  
* Node.js \- Backend services and API handling  
* MongoDB Atlas \- Cloud database for storing structured TOR data, user profiles, bookmarks, and system information  
* Vertex AI \- AI services for TOR analysis, including similarity analysis and anomaly/fairness assessment  
* e-GP / Government Procurement Data Sources \- Sources for collecting TOR and procurement information  
* Docker \- Application containerization and deployment  
* Google Cloud Platform (GCP) \- Cloud deployment environment  
* Email Notification Service \- External service for sending notifications to users

The system provides separate functionality for software vendors, public users, and platform administrators.

**Product Perspective Diagram:**![][image1]

## **2.2 Product Functions** {#2.2-product-functions}

| 1 | Aggregation & Search | Collects and parses TOR data from e-GP into structured, searchable records with keyword/filter search and detail views. |
| :---: | :---: | :---- |
| 2 | AI Summary & Fairness Analysis | Generates AI-assisted summaries and detects fairness/anomaly signals through similarity comparison across TORs. |
| 3 | Vendor Account & Matching | Manages vendor profiles, matches suitable opportunities, and supports bookmarking, saved searches, notifications, and deadline tracking. |
| 4 | Admin Operation | Provides authentication, account/permission management, ingestion monitoring, system health alerts, and audit logging. |
| 5 | Data Quality | Enables error reporting and content correction to maintain data accuracy. |

## **2.3 User Classes** {#2.3-user-classes}

The platform will serve the following user classes \- the actors who directly interact with the system through its UI. For brevity, the rest of this document refers to them by their short form: Public, Vendor, and Admin.

| No. | User Class | Role | Access Rights |
| :---- | :---- | :---- | :---- |
| 1 | Public/Citizens | General members of the public interested in reviewing government procurement | Search TORs, read AI summaries, and view Fairness Flags. No account required. |
| 2 | Software vendors/freelancers (bidders) | Businesses interested in bidding on software-procurement work, who want to find TORs they qualify for without manually checking every announcement | Everything a Public user can do, plus manage a company profile, receive automatic matches, and get notified |
| 3 | Platform administrators | Members of the development/data-operations team responsible for keeping the system's ingested data accurate and reviewing AI-generated fairness signals | Everything a Public user can do, plus control the ingestion engine, tune fairness thresholds, view logs, and review Fairness Flags |

## **2.4 Operating Environment** {#2.4-operating-environment}

* Client: Modern web browsers on desktop and laptop computers  
* Frontend: Next.js  
* Backend: Node.js  
* Database: MongoDB Atlas  
* AI Services: Google Cloud Vertex AI  
* Containerization: Docker  
* Cloud Platform: Google Cloud Platform (GCP)  
* Data Sources: e-GP and relevant Bangkok government agency websites  
* Authentication: JWT \- based authentication  
* Email Service: SendGrid  
* Communication: HTTPS for communication between clients, backend services, and external APIs

## **2.5 Design and Implementation Constraints** {#2.5-design-and-implementation-constraints}

| 1 | The frontend shall be implemented using Next.js. |
| :---: | :---- |
| 2 | Backend services shall be implemented using Node.js. |
| 3 | The system shall use MongoDB Atlas as its primary database. |
| 4 | AI-based analysis shall use Google Cloud Vertex AI. |
| 5 | The application shall be containerized using Docker. |
| 6 | The system shall be deployed on Google Cloud Platform (GCP). |
| 7 | The system shall use the SendGrid email service to send user notifications.  |
| 8 | Authentication shall use JWT-based authentication. |
| 9 | Authentication tokens shall be handled using appropriate secure mechanisms, such as HttpOnly and Secure cookies. |
| 10 | The system shall retrieve TOR information from permitted government procurement data sources. |
| 11 | Data collection shall comply with applicable source terms, access policies, and regulations. |
| 12 | The system shall preserve a reference to the original TOR source where applicable. |
| 13 | All communication involving user data and system APIs shall use HTTPS. |
| 14 | AI-generated anomaly or fairness results shall be presented as signals for review and shall not be presented as definitive conclusions of wrongdoing. |
| 15 | The system shall distinguish between information extracted directly from TOR documents and AI-generated analysis. |
| 16 | Personal data shall be handled in accordance with applicable privacy requirements, including the PDPA. |
| 17 | The system shall use the API for the e-GP data acquisition method. |
| 18 | The system shall use Gemini 2.0/2.5 Flash for the Vertex AI model. |
| 19 | The system shall use Google Cloud Storage (GCS) as a PDF/file storage mechanism. |
| 20 | The system shall use a rule-based weighted scoring algorithm for Vendor matching algorithm |
| 21 | The system shall use Cloud Run for the specific GCP deployment service. |

## **2.6 Assumptions and Dependencies** {#2.6-assumptions-and-dependencies}

| 1 | e-GP and relevant government agency websites provide publicly accessible procurement information. |
| :---: | :---- |
| 2 | The structure and availability of source websites may change and may affect the data collection pipeline. |
| 3 | TOR documents are available in formats the system can process, primarily PDF. |
| 4 | Google Cloud Vertex AI services remain available and accessible to the application. |
| 5 | MongoDB Atlas remains available for storing and retrieving system data. |
| 6 | GCP provides the required infrastructure for deploying and operating the application. |
| 7 | Users provide accurate information when creating vendor profiles. |
| 8 | AI-generated analysis may contain errors and may require human review. |
| 9 | The accuracy of aggregated information depends on the availability and accuracy of the original government sources. |
| 10 | Email notifications depend on the availability of the selected external email service. |

# **3\. External Interface Requirements** {#3.-external-interface-requirements}

## **3.1 Stakeholder Identification and Roles** {#3.1-stakeholder-identification-and-roles}

|  | Stakeholder | Role | Expected Requirements |
| :---- | :---- | :---- | :---- |
| 1\. | Software vendors/freelancers (bidders) | Primary users who search, review, and analyze procurement opportunities to prepare bids |  Search, advanced filtering, AI-generated TOR summaries, bookmarking, document download, personalized notifications, keyword alerts, vendor  profile management, AI-based opportunity matching,  application status tracking, deadline calendar |
| 2\. | Platform administrators | Manage and maintain the platform, users, data, and AI services | User management, data monitoring, AI configuration, content moderation, and system logs |
| 3\. | Development Team | Design, develop, test, and maintain the application |  Clear functional and non-functional requirements, API documentation, source code management, testing environment, deployment pipeline |
| 4\. | Bangkok Metropolitan Administration (BMA) Departments | Data source \- provide and publish procurement announcements and TOR | Accurate and up-to-date presentation of procurement data, correct document categorization, reliable synchronization with published information |
| 5\. | Comptroller General's Department (กรมบัญชีกลาง) / e-GP | Primary source of government procurement data and regulations | Compliance with e-GP data usage policies, accurate procurement information, secure and reliable data integration, proper source attribution |
| 6\. | Public/Citizens | Access publicly available procurement information, without needing an account, to promote awareness and detect irregularities worth investigating | Easy-to-use interface, public search, transparent access to procurement data, responsive design, accessibility,  TOR detail pages with AI summaries, AI Fairness signals with supporting reasoning |

## 

## **3.2 Hardware Interfaces** {#3.2-hardware-interfaces}

The system is a web-based application and does not require any specialized or dedicated hardware interfaces (e.g., sensors, scanners, or embedded devices).

| Client-side | The platform can be accessed from any device capable of running a modern web browser (desktop, laptop, tablet, or smartphone) with a stable internet connection. No additional hardware is required. |
| :---- | :---- |
| Server-side | The system operates on standard cloud server infrastructure (CPU, memory, and storage) sufficient to run the web server, database, and TOR-scraping/AI-processing services. No proprietary or specialized hardware is required. |

## **3.3 Software Interfaces** {#3.3-software-interfaces}

The TOR checker interfaces with several external software components to provide data aggregation, AI-assisted analysis, authentication, and notification services. The major software interfaces and their characteristics are described below.  
 

| 1\. | e-GP (Electronic Government Procurement System) \- Primary external data source for procurement announcements and TOR documents. The system retrieves publicly available data through automated scraping and/or available APIs, in accordance with e-GP's data usage policies. |
| :---- | :---- |
| 2\. | Agency-Specific Websites \- Secondary data sources for TOR announcements not fully captured through e-GP. Data is collected via automated scraping of publicly accessible agency web pages. |
| 3\. | Database System (MongoDB) \- Stores structured TOR data, user accounts, vendor profiles, bookmarks, application status, and system logs. The application communicates with the database via a standard database driver/ODM (Mongoose). |
| 4\. | AI/LLM Service \- Provides natural language processing used for AI-assisted TOR summarization (key requirements, qualifications, evaluation criteria) and AI-based similarity/anomaly detection between TORs. The system sends TOR text content via API calls and receives structured summary/analysis output in return. |
| 5\. | Email/Notification Service \- Sends email notifications to users when new TORs match their saved searches or keyword alerts. Communication occurs via SMTP or a third-party email delivery API (e.g., SendGrid, AWS SES). |
| 6\. | Authentication Provider (Google OAuth) \- Supports third-party sign-in for user authentication, in addition to standard email/password authentication. |
| 7\. | Web Browser \- The client-side interface through which users access the system. The platform is a responsive web application compatible with modern browsers (Chrome, Firefox, Safari, Edge \- latest two major versions). |

## 

## **3.4 User Interfaces** {#3.4-user-interfaces}

The TOR checker provides a web-based, responsive graphical user interface accessible through standard web browsers on desktop, tablet, and mobile devices. The interface is presented primarily in Thai, with consistent typography, color, and component styling applied across all screens. The major user interface screens are described below.

|  | Page | Detail |
| :---- | :---- | :---- |
| 1\. | Homepage | Landing page displaying featured and recently announced TORs, category browsing, and quick access to search. |
| 2\. | TOR Search / Listing Page |  Provides a search bar and filter panel (category, agency, budget range, status, deadline) with a sortable, paginated grid of TOR results. |
| 3\. | TOR Detail Page | Displays full TOR information, including the AI-generated summary (key points, qualifications, evaluation criteria with confidence level), project metadata, a link to download the original document, a bookmark control, and related TORs. |
| 4\. | Login / Sign-Up Pages | Authentication forms supporting email/password registration and sign-in, as well as third-party sign-in via Google. |
| 5\. | Vendor Dashboard  | A personalized landing page for authenticated vendors, showing a greeting, quick-access status indicators (saved TORs, upcoming deadlines, submitted applications), AI-recommended TORs based on the vendor's profile, and the full TOR catalog with category filters. |
| 6\. | Bookmarks Hub | A unified page for managing saved TORs, with three switchable views: a saved-list grid, an application status tracking board (Kanban-style), and a deadline calendar with upcoming-deadline reminders. |
| 7\. | Business Profile Page | A form used to collect vendor information (business type, interested categories, budget range, experience, service area, certifications) for AI-based opportunity matching. Presented as an onboarding step after registration and editable later through the account menu. |
| 8\. | Admin Dashboard | Internal screens for platform administrators, including procurement record management, data synchronization/scraper health monitoring, and system usage logs. |

MockUp UI  
![][image2]![][image3]  
![][image4]  
![][image5]  
![][image6]  
![][image7]  
![][image8]  
![][image9]

## **3.5 Communications Interfaces** {#3.5-communications-interfaces}

The TOR checker communicates with users and external systems using standard internet protocols to ensure secure and reliable data exchange. The major communication interfaces are described below.

| 1\. | HTTPS (Hypertext Transfer Protocol Secure) \- All communication between the client (web browser) and the application server is conducted over HTTPS, using TLS encryption to protect data in transit, including login credentials and personal information. |
| :---- | :---- |
| 2\. | RESTful API / JSON \- The frontend communicates with the backend server, and the backend communicates with external services (e.g., the AI/LLM service), using RESTful APIs that exchange data in JSON format. |
| 3\. | SMTP (Simple Mail Transfer Protocol) \- Used to send email notifications to users regarding new matching TOR opportunities, saved search alerts, and account-related messages. |
| 4\. | OAuth 2.0 \- Facilitates secure third-party authentication through Google, allowing users to sign in without creating a separate password. |
| 5\. | Database Connection Protocol \- The application server communicates with the MongoDB database using the MongoDB Wire Protocol over a secure, authenticated connection. |

# 

# **4\. Functional Requirements** {#4.-functional-requirements}

## **4.1 Search & Browse** {#4.1-search-&-browse}

Description: Allows Public/Vendor users to search, filter, and view TOR information without requiring an account, supporting the platform's transparency goals.

| ID | Requirement |
| :---- | :---- |
| FR-1 | The system shall allow users to search TORs by keyword, matching against TOR title, description, and extracted content. |
| FR-2 | The system shall display search results in a paginated, sortable grid. |
| FR-3 | The system shall allow users to filter TOR search results by budget range (minimum and maximum value). |
| FR-4 | The system shall allow users to filter TOR search results by announcement date and/or submission-deadline date. |
| FR-5 | The system shall allow users to filter TOR search results by publishing agency. |
| FR-6 | The system shall allow users to filter TOR search results by technology stack and project type. |
| FR-7 | The system shall allow users to combine multiple filters (keyword, budget, date, agency, category) in a single search query. |
| FR-8 | The system shall display a TOR detail page containing project metadata, qualification requirements, evaluation criteria, budget, and submission deadline. |
| FR-9 | The system shall provide a link on the TOR detail page to download or view the source document. |
| FR-10 | The system shall make search, filtering, and TOR detail viewing accessible to unauthenticated (public) users. |
| FR-11 | The system shall display a list of related or similar TORs on the TOR detail page, based on similarity analysis. |

## **4.2 AI Summary & Fairness** {#4.2-ai-summary-&-fairness}

Description: Provides AI-generated summarization of TOR content and AI-assisted fairness/anomaly analysis to help users assess procurement documents, with clear separation between source content and AI-generated content.

| ID | Requirement |
| :---- | :---- |
| FR-12 | The system shall generate an AI-assisted summary of each TOR, including key requirements, bidder qualifications, and evaluation criteria. |
| FR-13 | The system shall display the AI-generated summary alongside a link or view of the original TOR document so users can verify the summary against the source. |
| FR-14 | The system shall visually distinguish AI-generated content from content extracted verbatim from the source document. |
| FR-15 | The system shall analyze each TOR for potential fairness/anomaly signals, including significant budget deviation, unusually narrow eligibility requirements, brand-locked specifications, and unusually short bidding periods. |
| FR-16 | The system shall display fairness/anomaly signals on the TOR detail page along with the AI's supporting reasoning for each signal. |
| FR-17 | The system shall present fairness/anomaly results as signals for further review and shall not present them as definitive conclusions of wrongdoing. |
| FR-18 | The system shall group similar TORs using AI-based similarity analysis to support anomaly detection (e.g., budget comparison against similar TORs). |
| FR-19 | The system shall allow Administrators to view the full details behind a fairness flag, including the specific data points and reasoning used to generate it. |
| FR-20 | The system shall display a confidence level alongside each AI-generated summary or fairness signal,and shall allow an Administrator to configure the fairness pre-filter thresholds used to generate them. |

## **4.3 Vendor Account & Matching** {#4.3-vendor-account-&-matching}

Description: Allows software vendors and freelancers to register, build a business profile, and receive TOR opportunities matched to their capabilities.

| ID | Requirement |
| :---- | :---- |
| FR-21 | The system shall allow a Vendor to register an account using email/password or Google OAuth 2.0. |
| FR-22 | The system shall allow a Vendor to create and edit a business profile, including business type, registered capital, years of experience, certifications, technology stack, budget range, and service area. |
| FR-23 | The system shall present the business profile form as an onboarding step immediately after registration, and shall allow it to be edited later through the account menu. |
| FR-24 | The system shall automatically match open TORs to a Vendor's profile based on profile attributes (e.g., technology stack, budget range, qualifications). |
| FR-25 | For each matched TOR, the system shall display a breakdown of which qualification criteria the Vendor's profile meets and does not meet. |
| FR-26 | The system shall display AI-recommended/matched TORs on the Vendor Dashboard. |
| FR-27 | The system shall allow a Vendor to bookmark a TOR for later reference. |
| FR-28 | The system shall allow a Vendor to save search criteria for reuse. |
| FR-29 | The system shall send an email notification to a Vendor when a new TOR matches their saved search or profile criteria. |
| FR-30 | The system shall display an in-app notification to a Vendor when a new TOR matches their saved search or profile criteria. |
| FR-31 | The system shall allow a Vendor to set and update an application status (e.g., interested, preparing documents, submitted, missed) for each bookmarked TOR. |
| FR-32 | The system shall display a Vendor's bookmarked TORs in a Kanban-style board organized by application status. |
| FR-33 | The system shall display a deadline calendar view showing upcoming submission deadlines for a Vendor's bookmarked TORs. |

## **4.4 Admin Operation** {#4.4-admin-operation}

Description: Provides platform administrators with visibility into and control over the data ingestion pipeline, so that data collection issues can be detected and resolved.

| ID | Requirement |
| :---- | :---- |
| FR-34 | The system shall display the health status of the data ingestion pipeline (e.g., last successful run, current status, failure state) on the Admin Dashboard. |
| FR-35 | The system shall allow an Administrator to manually trigger a data synchronization run on demand. |
| FR-36 | The system shall report the outcome (success, partial success, or failure) of a manually triggered synchronization run to the Administrator who initiated it. |
| FR-37 | The system shall allow an Administrator to view system logs, including ingestion pipeline and AI-analysis pipeline events, for diagnostic purposes. |
| FR-38 | The system shall allow an Administrator to filter or search system logs by date, source (ingestion, AI pipeline, application), and severity. |
| FR-39 | The system shall alert Administrators when the data synchronization pipeline fails or does not complete within an expected time window. |
| FR-40 | The system shall allow an Administrator to review, correct, and update TOR data and content flagged as erroneous. |
| FR-41 | The system shall allow users to report an error in TOR information displayed on the platform, routed to the Admin Dashboard for review. |

## **4.5 Data Ingestion Pipeline** {#4.5-data-ingestion-pipeline}

| ID | Requirement |
| :---- | :---- |
| FR-42 | The system shall retrieve TOR announcements from the BMA e-GP procurement data API. |
| FR-43 | The system shall filter retrieved announcements to include only software/IT-related procurement. |

# 

# **5\. Non-Functional Requirements** {#5.-non-functional-requirements}

This section specifies the non-functional requirements for the TOR Checker. These requirements define the quality attributes and constraints the system must satisfy.

## **5.1 Performance Requirements** {#5.1-performance-requirements}

| ID | Requirement |
| :---- | :---- |
| NFR-1 | The system SHALL return search and filter results within 7 seconds under normal load. |
| NFR-2 | The system SHALL fully load a TOR detail page (including its AI summary) within 12 seconds under normal load. |

## **5.2 Security Requirements** {#5.2-security-requirements}

| ID | Requirement |
| :---- | :---- |
| NFR-3 | User passwords SHALL be stored hashed, never as plain text. |
| NFR-4 | Vendors' personal data (e.g., registered capital, contact information) SHALL be stored and processed in compliance with the PDPA. |

## **5.3 Usability Requirements** {#5.3-usability-requirements}

| ID | Requirement |
| :---- | :---- |
| NFR-5 | The system's user interface SHALL be entirely in Thai. |

# 

# **6\. Other Requirements**  {#6.-other-requirements}

## **6.1 Database Requirements** {#6.1-database-requirements}

| The system SHALL use MongoDB Atlas, a document-oriented NoSQL database, as its primary data store. |
| :---- |

## **6.2 Internationalization Requirements** {#6.2-internationalization-requirements}

| The system user interface SHALL be in Thai. |
| :---- |

## **6.3 Data Model** {#6.3-data-model}

The system SHALL organize its data into eight MongoDB collections. Each document is uniquely identified by its \_id field (MongoDB ObjectId), which functions as the collection's primary key. Relationships between collections are represented by reference fields storing another document's \_id, analogous to a foreign key in a relational schema. Data always retrieved with its parent document is embedded as a subdocument rather than stored in a separate collection.

**users**

| Field | Type | Description |
| :---- | :---- | :---- |
| \_id | ObjectId | Primary key |
| email | String | Account email, unique |
| passwordHash | String | Hashed password; null if account uses Google OAuth only |
| googleOAuthId | String | Google OAuth identifier; null if account uses email/password only |
| role | String | vendor or admin |
| createdAt | Date | Account creation timestamp |

**vendorProfiles**

| Field | Type | Description |
| :---- | :---- | :---- |
| \_id | ObjectId | Primary key |
| userId | ObjectId | Foreign key → users.\_id; one-to-one relationship |
| businessType | String | Vendor's registered business type |
| registeredCapital | Number | Registered capital amount |
| yearsExperience | Number | Years of relevant experience |
| certifications | Array\<String\> | List of held certifications |
| technologyStack | Array\<String\> | Technologies the vendor works with |
| budgetRange | Object {min, max} | Vendor's target project budget range |
| serviceArea | String | Vendor's geographic service area |
| savedSearches | Array\<Object\> | Embedded array of saved search criteria (FR-28) |

**tors**

| Field | Type | Description |
| :---- | :---- | :---- |
| \_id | ObjectId | Primary key |
| title | String | TOR title |
| description | String | TOR description |
| sourceDocumentUrl | String | Reference to the source PDF stored in Google Cloud Storage |
| agency | String | Publishing government agency |
| budget | Number | Stated project budget |
| announcementDate | Date | Announcement publication date |
| submissionDeadline | Date | Bid submission deadline |
| technologyStack | Array\<String\> | Technologies required by the project |
| projectType | String | Category of the project |
| qualificationRequirements | Array\<String\> | Bidder eligibility requirements |
| evaluationCriteria | String | Stated evaluation criteria |
| aiSummary | Object {text, confidence} | Embedded AI-generated summary and confidence score (FR-12, FR-20) |
| fairnessFlags | Array\<Object\> | Embedded array of Fairness Flags, each with signal type, reasoning, and confidence (FR-15–FR-20) |
| similarTORs | Array\<ObjectId\> | References to related tors documents identified via similarity analysis (FR-11, FR-18) |

**bookmarks**

| Field | Type | Description |
| :---- | :---- | :---- |
| \_id | ObjectId | Primary key |
| vendorId | ObjectId | Foreign key → vendorProfiles.\_id |
| torId | ObjectId | Foreign key → tors.\_id |
| applicationStatus | String | interested, preparing, submitted, or missed (FR-31) |
| bookmarkedAt | Date | Timestamp the TOR was bookmarked |

**notifications**

| Field | Type | Description |
| :---- | :---- | :---- |
| \_id | ObjectId | Primary key |
| vendorId | ObjectId | Foreign key → vendorProfiles.\_id |
| torId | ObjectId | Foreign key → tors.\_id |
| type | String | Notification category |
| read | Boolean | Whether the Vendor has viewed the notification |
| createdAt | Date | Notification creation timestamp |

**errorReports**

| Field | Type | Description |
| :---- | :---- | :---- |
| \_id | ObjectId | Primary key |
| torId | ObjectId | Foreign key → tors.\_id |
| reportedBy | ObjectId | Foreign key → users.\_id; null for unauthenticated Public reporters |
| description | String | Description of the reported error |
| status | String | open or resolved |
| createdAt | Date | Report submission timestamp |

**ingestionRuns**

| Field | Type | Description |
| :---- | :---- | :---- |
| \_id | ObjectId | Primary key |
| triggeredBy | String / ObjectId | scheduled, or a foreign key → users.\_id for a manually triggered run |
| startedAt | Date | Run start timestamp |
| completedAt | Date | Run completion timestamp |
| status | String | success, partial, or failed |
| outcomeSummary | String | Summary of the run's outcome |

**systemLogs**

| Field | Type | Description |
| :---- | :---- | :---- |
| \_id | ObjectId | Primary key |
| source | String | ingestion, ai-pipeline, or application |
| severity | String | Log severity level |
| message | String | Log message content |
| timestamp | Date | Log entry timestamp |

# 

# **Appendix A: Glossary**  {#appendix-a:-glossary}

## **A1. Procurement & Domain Terms** {#a1.-procurement-&-domain-terms}

| Term / Acronym | Definition |
| :---- | :---- |
| TOR (Terms of Reference) | A procurement document issued by a government agency that defines the scope of work, deliverables, required bidder qualifications, project timeline, budget ceiling, and evaluation criteria for a project. In this system, a TOR is the primary unit of data that is collected, parsed, summarized, and analyzed. |
| e-GP (Electronic Government Procurement) | Thailand's national electronic procurement system, operated by the Comptroller General's Department, through which government agencies publish procurement announcements and attach TOR documents. It is the system's primary external data source. |
| BMA (Bangkok Metropolitan Administration) | The local government body administering Bangkok. Its departments and affiliated agencies are the procuring organizations whose software-related TORs fall within the scope of this platform. |
| Comptroller General's Department | The government department that operates e-GP and issues procurement regulations. It is a stakeholder because the system's data collection must comply with its data-usage policies and source-attribution expectations. |
| Procurement Announcement | The public notice stating that an agency intends to procure goods or services. It typically contains the announcement reference number, procuring agency, budget, submission window, and links to attached TOR documents. |
| Bidding Period / Submission Window | The interval between the publication of an announcement and its submission deadline, during which vendors may prepare and submit proposals. An unusually short window is one of the characteristics the system flags for review. |
| Bidding Deadline | The date and time after which proposals are no longer accepted. Deadlines drive the system's calendar view, upcoming-deadline reminders, and email notifications. |
| Reference Price | The official estimated price that an agency sets as the budget baseline for a procurement. It serves as one reference point when the system evaluates whether a TOR's budget deviates abnormally. |
| Budget Deviation | The gap between a TOR's stated budget and an expected value \- either its reference price or the median budget of similar TORs identified through similarity analysis. A large deviation in either direction is treated as an anomaly signal, not as proof of irregularity. |
| Eligibility / Qualification Requirements | The conditions a bidder must satisfy to be eligible, such as minimum registered capital, years of experience, past contract value, or specific certifications. Requirements that are unusually narrow may reduce the pool of eligible bidders and are therefore analyzed by the system. |
| Brand-locked Specification | A technical requirement that names a specific brand, model, or proprietary product without permitting an equivalent alternative, effectively restricting the procurement to a single supplier. Detecting such phrasing is one of the system's fairness checks. |
| Fairness Flag | An AI-generated signal attached to a TOR indicating that the analysis detected one or more anomaly patterns \- such as significant budget deviation, unusually narrow eligibility requirements, a brand-locked specification, or an unusually short bidding period. |
| Vendor | A company or registered business that is interested in bidding on software-procurement work. Vendors may create an account, maintain a business profile, and receive matched opportunities. |
| Freelancer | An individual practitioner who bids on or delivers software work independently rather than through a company. Treated as a sub-class of vendors with the same platform capabilities. |
| Registered Capital | The capital amount recorded in a business's official registration, frequently used in TORs as a qualification threshold. Because it is collected in vendor profiles, it is handled as protected business/personal data under the PDPA. |
| Domain Expert / Auditor | A person with procurement or legal expertise who reviews TOR content and evaluates whether AI-generated summaries and anomaly signals are accurate. Provides the human review layer over automated analysis. |
| PDPA | Thailand's Personal Data Protection Act B.E. 2562 (2019), which governs the collection, use, storage, and disclosure of personal data. It constrains how the system stores vendor profile data, contact information, and account records. |

## **A2. AI & Data Analysis Terms** {#a2.-ai-&-data-analysis-terms}

| Term / Acronym | Definition |
| :---- | :---- |
| AI-assisted Summary | A machine-generated condensation of a TOR that highlights key requirements, bidder qualifications, and evaluation criteria. It is displayed alongside — and visually distinguished from — information extracted verbatim from the source document. |
| Natural Language Processing | The language-processing capability provided by the AI/LLM service, used for TOR summarization and for similarity and anomaly detection between TORs. |
| AI/LLM Service | The external service that receives TOR text content via API calls and returns structured summary and analysis output. |
| Embedding | A numeric vector representation of text used to measure semantic similarity. Embeddings allow TORs to be compared by meaning rather than by exact wording. |
| Vertex AI | Google Cloud's AI service platform used for TOR analysis, including similarity analysis and anomaly/fairness assessment. The system uses the Gemini 2.0/2.5 Flash model. |

## **A3. Technical & Architectural Terms** {#a3.-technical-&-architectural-terms}

| Term / Acronym | Definition |
| :---- | :---- |
| Next.js | The web framework used to implement the platform's responsive frontend. |
| Node.js | The runtime used to implement the backend services and API handling. |
| MongoDB Atlas | The cloud-hosted MongoDB service is used as the system's primary data store for structured TOR data, user profiles, vendor profiles, bookmarks, application status, and system logs. |
| Docker | The containerization technology used to package the application for consistent deployment. |
| GCP (Google Cloud Platform) | The cloud environment in which the system is deployed and which provides the required operating infrastructure. The system is deployed on Cloud Run. |
| RESTful API | The interface style is used between the frontend and backend, and between the backend and external services such as the AI/LLM service. |
| JSON | The data format exchanged over the system's RESTful APIs. |
| HTTPS | Hypertext Transfer Protocol Secure. All communication between clients, backend services, and external APIs uses HTTPS, applying TLS encryption to protect data in transit, including login credentials and personal information. |
| OAuth 2.0 | The standard that facilitates secure third-party authentication through Google, allowing users to sign in without creating a separate password. |
| Google OAuth | The authentication provider supporting third-party sign-in, offered in addition to standard email/password authentication. |
| Email Notification Service | The external service used to deliver email notifications, via SMTP or a third-party delivery API. The system uses SendGrid. |
| Data Collection Pipeline | The component that collects and synchronizes TOR data from e-GP and relevant agency sources. It may be affected by changes in the structure or availability of source websites. |

## **A4. Requirements Engineering Terms** {#a4.-requirements-engineering-terms}

| Term / Acronym | Definition |
| :---- | :---- |
| SRS (Software Requirements Specification) | This document, which defines the functional and non-functional requirements for the system and serves as a reference for development, testing, validation, and evaluation. It follows standard IEEE SRS conventions. |
| FR (Functional Requirement) | A required system behavior, identified with the prefix FR- and a numeric identifier, and stated using the keyword "shall". |
| NFR (Non-functional Requirement) | A quality attribute, constraint, or system-wide property \- such as performance, security, usability, reliability, or compatibility \- identified with the prefix NFR- and a numeric identifier. |
| "Shall" | The keyword indicates mandatory system behavior. All requirements in this document are considered mandatory unless explicitly stated otherwise. |
| UC (Use Case) | A structured description of an interaction with the system, documented with Preconditions, a Main Success Scenario, and Alternative or Exception Paths where applicable. |
| Precondition | A condition that must hold before a use case can begin. |
| Main Success Scenario | The sequence of steps followed when a use case completes successfully. |
| Alternative / Exception Path | A documented deviation from the main success scenario, covering error conditions or valid variations. |
| User Story | A requirement written as "As a \<role\>, I want \<goal\> so that \<reason\>", used to derive system features and functional requirements. |
| User Class | A category of user distinguished by goals and usage patterns, such as software vendor, general public, journalist, government agency, administrator, domain expert, developer, or compliance advisor. |
| Stakeholder | A party with an interest in the system, including primary users, data sources, maintainers, and legal/compliance reviewers. |
| Normal Load | The expected operating conditions under which the stated performance targets apply. |
| TBD (To Be Determined) | A marker for a decision not yet made |

## 

[image1]: srs-images/image1.png

[image2]: srs-images/image2.png

[image3]: srs-images/image3.png

[image4]: srs-images/image4.png

[image5]: srs-images/image5.png

[image6]: srs-images/image6.png

[image7]: srs-images/image7.png

[image8]: srs-images/image8.png

[image9]: srs-images/image9.png