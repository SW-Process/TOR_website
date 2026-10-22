"""Build the TOR Checker project ontology (OWL 2, RDF/XML).

The ontology describes the whole application: who uses it (roles, accounts),
what it stores (the MongoDB data model and its enumerations), what it does
(features, API endpoints, frontend pages), how TORs flow through it (the
ingestion and AI pipeline) and where it runs (system components).

Every fact here is taken from the code on `main`; the file and line each one
comes from is given in the comment next to it where it is not obvious.

    pip install rdflib
    python docs/ontology/build_ontology.py docs/ontology/tor-checker.owl
"""

from __future__ import annotations

import re
import sys

from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.collection import Collection
from rdflib.namespace import DCTERMS, OWL, RDF, RDFS, XSD

BASE = "https://github.com/SW-Process/TOR_website/ontology"
TOR = Namespace(BASE + "#")

g = Graph()
g.bind("tor", TOR)
g.bind("owl", OWL)
g.bind("dcterms", DCTERMS)

ONTO = URIRef(BASE)
g.add((ONTO, RDF.type, OWL.Ontology))
g.add((ONTO, OWL.versionInfo, Literal("1.0.0")))
g.add((ONTO, DCTERMS.title, Literal("TOR Checker ontology", lang="en")))
g.add((ONTO, DCTERMS.description, Literal(
    "Domain and application ontology of TOR Checker (BKK Software TOR Aggregator & Fairness "
    "Checker): users and roles, the data model, features, API endpoints, frontend pages, the "
    "TOR ingestion and AI pipeline, and the deployed system components.", lang="en")))
for name in ("Paranyu", "Pakorn", "Karnpon"):
    g.add((ONTO, DCTERMS.creator, Literal(name)))
g.add((ONTO, DCTERMS.source, URIRef("https://github.com/SW-Process/TOR_website")))

FILE_PATH = TOR.filePath  # declared below; used by helpers


# --------------------------------------------------------------------------- helpers

def label(node, en, th=None, comment=None):
    g.add((node, RDFS.label, Literal(en, lang="en")))
    if th:
        g.add((node, RDFS.label, Literal(th, lang="th")))
    if comment:
        g.add((node, RDFS.comment, Literal(comment, lang="en")))


def cls(name, en, comment=None, parent=None, th=None):
    c = TOR[name]
    g.add((c, RDF.type, OWL.Class))
    label(c, en, th, comment)
    for p in ([parent] if isinstance(parent, str) else parent or []):
        g.add((c, RDFS.subClassOf, TOR[p]))
    return c


def union(names):
    if len(names) == 1:
        return TOR[names[0]]
    node = BNode()
    g.add((node, RDF.type, OWL.Class))
    lst = BNode()
    Collection(g, lst, [TOR[n] for n in names])
    g.add((node, OWL.unionOf, lst))
    return node


def op(name, domain, range_, en, comment=None, inverse=None, chars=()):
    p = TOR[name]
    g.add((p, RDF.type, OWL.ObjectProperty))
    label(p, en, comment=comment)
    if domain:
        g.add((p, RDFS.domain, union(domain if isinstance(domain, list) else [domain])))
    if range_:
        g.add((p, RDFS.range, union(range_ if isinstance(range_, list) else [range_])))
    for c in chars:
        g.add((p, RDF.type, getattr(OWL, c)))
    if inverse:
        inv = TOR[inverse[0]]
        g.add((inv, RDF.type, OWL.ObjectProperty))
        label(inv, inverse[1])
        g.add((inv, OWL.inverseOf, p))
    return p


def dp(name, domain, dtype, en, comment=None, functional=False):
    p = TOR[name]
    g.add((p, RDF.type, OWL.DatatypeProperty))
    label(p, en, comment=comment)
    if domain:
        g.add((p, RDFS.domain, union(domain if isinstance(domain, list) else [domain])))
    g.add((p, RDFS.range, dtype))
    if functional:
        g.add((p, RDF.type, OWL.FunctionalProperty))
    return p


def restrict(cls_name, prop, kind, filler=None, n=None):
    """Add `cls_name ⊑ (prop kind filler)`; kind is some/only/exactly/max/value."""
    r = BNode()
    g.add((r, RDF.type, OWL.Restriction))
    g.add((r, OWL.onProperty, TOR[prop]))
    if kind == "some":
        g.add((r, OWL.someValuesFrom, TOR[filler]))
    elif kind == "only":
        g.add((r, OWL.allValuesFrom, TOR[filler]))
    elif kind == "value":
        g.add((r, OWL.hasValue, TOR[filler]))
    elif kind in ("exactly", "max", "min"):
        pred = {"exactly": OWL.qualifiedCardinality, "max": OWL.maxQualifiedCardinality,
                "min": OWL.minQualifiedCardinality}[kind]
        g.add((r, pred, Literal(n, datatype=XSD.nonNegativeInteger)))
        g.add((r, OWL.onClass, TOR[filler]))
    g.add((TOR[cls_name], RDFS.subClassOf, r))


def defined(name, en, comment, base, prop, value=None, some=None, th=None):
    """name ≡ base ⊓ ∃prop.{value}  (or ∃prop.some)."""
    c = cls(name, en, comment, th=th)
    r = BNode()
    g.add((r, RDF.type, OWL.Restriction))
    g.add((r, OWL.onProperty, TOR[prop]))
    if value:
        g.add((r, OWL.hasValue, TOR[value]))
    else:
        g.add((r, OWL.someValuesFrom, TOR[some]))
    inter = BNode()
    g.add((inter, RDF.type, OWL.Class))
    lst = BNode()
    Collection(g, lst, [TOR[base], r])
    g.add((inter, OWL.intersectionOf, lst))
    g.add((c, OWL.equivalentClass, inter))
    return c


def ind(name, types, en, th=None, comment=None, **facts):
    i = TOR[name]
    g.add((i, RDF.type, OWL.NamedIndividual))
    for t in [types] if isinstance(types, str) else types:
        g.add((i, RDF.type, TOR[t]))
    label(i, en, th, comment)
    for prop, vals in facts.items():
        for v in vals if isinstance(vals, list) else [vals]:
            if isinstance(v, URIRef):
                g.add((i, TOR[prop], v))
            elif isinstance(v, Literal):
                g.add((i, TOR[prop], v))
            else:
                g.add((i, TOR[prop], TOR[v]))
    return i


def all_different(names):
    node = BNode()
    g.add((node, RDF.type, OWL.AllDifferent))
    lst = BNode()
    Collection(g, lst, [TOR[n] for n in names])
    g.add((node, OWL.distinctMembers, lst))


def disjoint(names):
    if len(names) == 2:
        g.add((TOR[names[0]], OWL.disjointWith, TOR[names[1]]))
        return
    node = BNode()
    g.add((node, RDF.type, OWL.AllDisjointClasses))
    lst = BNode()
    Collection(g, lst, [TOR[n] for n in names])
    g.add((node, OWL.members, lst))


def ident(text):
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")


def enum(class_name, en, comment, prefix, values, source, th=None):
    """An enumeration class closed with owl:oneOf; returns {value: individual name}.

    values: list of (code, english label, thai label or None).
    """
    cls(class_name, en, comment + f" Values come from {source}.", parent="Enumeration", th=th)
    names = {}
    for code, en_label, th_label in values:
        n = f"{prefix}_{ident(code)}"
        names[code] = n
        ind(n, class_name, en_label, th_label, code=Literal(code))
    lst = BNode()
    Collection(g, lst, [TOR[n] for n in names.values()])
    one = BNode()
    g.add((TOR[class_name], OWL.equivalentClass, one))
    g.add((one, RDF.type, OWL.Class))
    g.add((one, OWL.oneOf, lst))
    all_different(list(names.values()))
    return names


# --------------------------------------------------------------------------- top-level classes

TOP = {
    "Agent": ("Agent", "Someone who uses or builds the application."),
    "Role": ("Role", "One of the three user roles of the application (SRS: Public, Vendor, Admin)."),
    "DataEntity": ("Data entity", "Something the application stores or derives from stored data."),
    "Enumeration": ("Enumeration", "A closed set of allowed values of a field (a Mongoose `enum` or a config list)."),
    "Feature": ("Feature", "A user-visible capability of the application."),
    "ApiEndpoint": ("API endpoint", "One HTTP route of the Express backend."),
    "ApiRouter": ("API router", "An Express router mounted under one `/api/...` prefix (backend/src/app.ts)."),
    "FrontendPage": ("Frontend page", "A Next.js App Router page (frontend/src/app/**/page.tsx)."),
    "PipelineStage": ("Pipeline stage", "One step of the TOR ingestion and AI enrichment pipeline."),
    "SystemComponent": ("System component", "A deployed part of the system or an external service it depends on."),
    "SourceModule": ("Source module", "A file or folder of the repository that implements something."),
    "MongoCollection": ("MongoDB collection", "A collection in the application's MongoDB database."),
    "AccessLevel": ("Access level", "Who may call an endpoint or open a page, as enforced by the auth middleware."),
    "SoftwareProject": ("Software project", "The project itself."),
}
for k, (en, c) in TOP.items():
    cls(k, en, c)
# Enumeration individuals are values, not features, pages, etc.
disjoint([k for k in TOP if k not in ("Agent", "DataEntity", "Role", "AccessLevel")])
disjoint(["Role", "AccessLevel", "Feature", "ApiEndpoint", "DataEntity"])

# Agents
cls("Person", "Person", parent="Agent")
cls("TeamMember", "Team member", "A developer of TOR Checker.", parent="Person")
cls("PublicVisitor", "Public visitor", "Someone using the site without an account; never stored.", parent="Agent")
cls("UserAccount", "User account", "A row of the `users` collection (backend/src/models/User.ts).",
    parent=["Agent", "PersistentEntity"])
cls("VendorUser", "Vendor user", "An account with role `vendor`.", parent="UserAccount", th="ผู้ประกอบการ")
cls("AdminUser", "Admin user", "An account with role `admin`.", parent="UserAccount", th="ผู้ดูแลระบบ")
disjoint(["VendorUser", "AdminUser"])
disjoint(["PublicVisitor", "UserAccount"])

# Data entities
cls("PersistentEntity", "Persistent entity", "A document stored in its own MongoDB collection.", parent="DataEntity")
cls("EmbeddedEntity", "Embedded entity", "A sub-document stored inside another document, never queried alone.",
    parent="DataEntity")
cls("DerivedValue", "Derived value", "Computed on request from stored data, never stored.", parent="DataEntity")
disjoint(["PersistentEntity", "EmbeddedEntity", "DerivedValue"])

PERSISTENT = {
    # name: (label, thai, collection, model file, comment)
    "TOR": ("TOR", "ประกาศ TOR", "tors", "Tor.ts",
            "A software-procurement Terms of Reference announced by a Bangkok agency; the central entity."),
    "VendorProfile": ("Vendor profile", "โปรไฟล์ธุรกิจ", "vendorprofiles", "VendorProfile.ts",
                      "The business profile of one vendor, 1:1 with the vendor's account (FR-22)."),
    "Bookmark": ("Bookmark", "TOR ที่บันทึกไว้", "bookmarks", "Bookmark.ts",
                 "A vendor's saved TOR with its application status (FR-27, FR-31, FR-32)."),
    "Notification": ("Vendor notification", "การแจ้งเตือน", "notifications", "Notification.ts",
                     "An in-app notice to a vendor about a TOR."),
    "AdminNotification": ("Admin notification", None, "adminnotifications", "AdminNotification.ts",
                          "A notice to an admin that a pipeline run failed."),
    "ErrorReport": ("Error report", "แจ้งข้อมูลคลาดเคลื่อน", "errorreports", "ErrorReport.ts",
                    "A correction of a TOR's data submitted by anyone, resolved by an admin."),
    "Session": ("Session", "อุปกรณ์ที่เข้าสู่ระบบ", "sessions", "Session.ts",
                "One sign-in on one device; deleting it signs that device out."),
    "IngestionRun": ("Ingestion run", None, "ingestionruns", "IngestionRun.ts",
                     "One run of a pipeline phase, with its counters and outcome."),
    "EnrichmentJob": ("Enrichment job", None, "enrichmentjobs", "EnrichmentJob.ts",
                      "A queued request to enrich one TOR with AI, claimed under a lease."),
    "SystemLog": ("System log entry", None, "systemlogs", "SystemLog.ts",
                  "A log line from ingestion, the AI pipeline or the application."),
    "ChatConversation": ("Chat conversation", None, "chatconversations", "ChatConversation.ts",
                         "The support chat thread between one user and the admins."),
    "ChatMessage": ("Chat message", None, "chatmessages", "ChatMessage.ts", "One message of a chat conversation."),
    "HelpAnnouncement": ("Help-center announcement", "ประกาศ", "announcements", "Announcement.ts",
                         "News, an update or a maintenance notice in the help center."),
    "Faq": ("FAQ", "คำถามที่พบบ่อย", "faqs", "Faq.ts", "A question and answer in the help center."),
}
for n, (en, th, _coll, _f, c) in PERSISTENT.items():
    cls(n, en, c, parent="PersistentEntity", th=th)
disjoint(list(PERSISTENT) + ["UserAccount"])

EMBEDDED = {
    "SourceDocument": ("Source document", "TOR", "The stored TOR (or invitation) PDF: storage key, text layer, size, sha256. The binary lives in Cloud Storage."),
    "ProcurementRecord": ("Procurement record", "TOR", "Procurement progress read from e-GP: stage, announcements, bid deadline."),
    "ProcurementAnnouncement": ("Procurement announcement", "TOR", "One e-GP announcement of a project (draft, invitation, winner...)."),
    "BidDeadline": ("Bid deadline", "TOR", "The real bid deadline read from the invitation PDF, or set by an admin."),
    "DeadlineAttempt": ("Deadline extraction attempt", "TOR", "The last attempt to read the bid deadline from an invitation PDF."),
    "AISummary": ("AI summary", "TOR", "Model-generated summary of the TOR; never presented as the agency's own text."),
    "EvaluationCriterion": ("Evaluation criterion", "TOR", "A bid evaluation criterion and its weight, extracted by AI."),
    "FairnessFlag": ("Fairness flag", "TOR", "An AI-raised neutral review signal about a TOR field; never an accusation."),
    "Classification": ("Software classification", "TOR", "The AI verdict on whether the TOR is software-related."),
    "SavedSearch": ("Saved search", "VendorProfile", "A vendor's named search filters, optionally with alerts (FR-28)."),
    "HiddenTorEntry": ("Hidden TOR entry", "VendorProfile", "A TOR the vendor chose not to see."),
    "DayNote": ("Calendar day note", "VendorProfile", "A vendor's note for one calendar day (YYYY-MM-DD)."),
    "BudgetRange": ("Budget range", "VendorProfile", "The budget range a vendor is interested in."),
}
for n, (en, _owner, c) in EMBEDDED.items():
    cls(n, en, c, parent="EmbeddedEntity")
disjoint(list(EMBEDDED))
cls("MatchResult", "Match result", "Rule-based vendor↔TOR match score, 0–100 (backend/src/services/matching.ts, FR-24/FR-25).",
    parent="DerivedValue", th="คะแนนความเหมาะสม")

# System components
for n, en, c in [
    ("FrontendApp", "Frontend application", "The Next.js web application."),
    ("BackendApi", "Backend API", "The Express REST API, the only part that talks to MongoDB."),
    ("BatchJob", "Batch job", "A Cloud Run job started by Cloud Scheduler."),
    ("BrowserExtension", "Browser extension", "A Chrome extension used by admins."),
    ("Datastore", "Datastore", "Where data or files are kept."),
    ("ExternalService", "External service", "A third-party or government service the system calls."),
]:
    cls(n, en, c, parent="SystemComponent")
disjoint(["FrontendApp", "BackendApi", "BatchJob", "BrowserExtension", "Datastore", "ExternalService"])

# --------------------------------------------------------------------------- properties

# generic
dp("code", "Enumeration", XSD.string, "code", "The literal value stored in the database or config.", functional=True)
dp("filePath", ["SourceModule"], XSD.string, "file path", "Path from the repository root.", functional=True)
dp("collectionName", "MongoCollection", XSD.string, "collection name", functional=True)
dp("httpMethod", "ApiEndpoint", XSD.string, "HTTP method", functional=True)
dp("urlPath", "ApiEndpoint", XSD.string, "URL path", functional=True)
dp("routePath", "FrontendPage", XSD.string, "route", "The URL path of the page.", functional=True)
dp("weight", "MatchCriterion", XSD.integer, "weight", "Points this criterion contributes to a 100-point match score.", functional=True)
g.add((TOR.storesInstancesOf, RDF.type, OWL.AnnotationProperty))
label(TOR.storesInstancesOf, "stores instances of", comment="The entity class whose documents a collection holds.")
g.add((TOR.cloudRunName, RDF.type, OWL.AnnotationProperty))
label(TOR.cloudRunName, "Cloud Run name")

# accounts and roles
op("hasRole", "UserAccount", "Role", "has role", chars=("FunctionalProperty",))
op("ownsProfile", "VendorUser", "VendorProfile", "owns profile", inverse=("profileOf", "profile of"),
   chars=("FunctionalProperty", "InverseFunctionalProperty"))
op("grantedTo", "AccessLevel", "Role", "granted to", "Roles that pass this access level.")
op("requiresAccess", ["ApiEndpoint", "FrontendPage"], "AccessLevel", "requires access",
   chars=("FunctionalProperty",))
op("sessionOf", "Session", "UserAccount", "session of", inverse=("hasSession", "has session"),
   chars=("FunctionalProperty",))
op("signInMethod", "Session", "SessionMethod", "sign-in method", chars=("FunctionalProperty",))
op("hasTeamMember", "SoftwareProject", "TeamMember", "has team member")

# TOR structure
op("hasSourceDocument", "TOR", "SourceDocument", "has source document", chars=("FunctionalProperty",))
op("hasProcurement", "TOR", "ProcurementRecord", "has procurement record", chars=("FunctionalProperty",))
op("hasAnnouncement", "ProcurementRecord", "ProcurementAnnouncement", "has announcement")
op("hasBidDeadline", "ProcurementRecord", "BidDeadline", "has bid deadline", chars=("FunctionalProperty",))
op("hasDeadlineAttempt", "ProcurementRecord", "DeadlineAttempt", "has deadline attempt", chars=("FunctionalProperty",))
op("hasAISummary", "TOR", "AISummary", "has AI summary", chars=("FunctionalProperty",))
op("hasEvaluationCriterion", "AISummary", "EvaluationCriterion", "has evaluation criterion")
op("hasFairnessFlag", "TOR", "FairnessFlag", "has fairness flag", inverse=("flagOn", "flag on"))
op("hasClassification", "TOR", "Classification", "has classification", chars=("FunctionalProperty",))
op("similarTo", "TOR", "TOR", "similar to", "Precomputed similar TORs (`similarTORs`).",
   chars=("SymmetricProperty", "IrreflexiveProperty"))
op("discoveredInRun", "TOR", "IngestionRun", "discovered in run")
op("inCategory", "TOR", "TorCategory", "in category", chars=("FunctionalProperty",))
op("hasProjectType", "TOR", "ProjectType", "has project type", chars=("FunctionalProperty",))
op("hasDisplayStatus", "TOR", "TorDisplayStatus", "has display status",
   "Derived by computeTorStatus (backend/src/utils/torStatus.ts).", chars=("FunctionalProperty",))
op("hasPipelineStatus", "TOR", "PipelineStatus", "has pipeline status", chars=("FunctionalProperty",))
op("hasStage", "ProcurementRecord", "ProcurementStage", "has stage", chars=("FunctionalProperty",))
op("stageSource", "ProcurementRecord", "ProcurementSource", "stage source", chars=("FunctionalProperty",))
op("hasTextLayer", "SourceDocument", "TextLayer", "has text layer", chars=("FunctionalProperty",))
op("documentKind", "SourceDocument", "DocumentKind", "document kind", chars=("FunctionalProperty",))
op("announcementKind", "ProcurementAnnouncement", "ProcurementAnnouncementKind", "announcement kind",
   chars=("FunctionalProperty",))
op("deadlineSource", "BidDeadline", "BidDeadlineSource", "deadline source", chars=("FunctionalProperty",))
op("deadlinePrecision", "BidDeadline", "DeadlinePrecision", "deadline precision", chars=("FunctionalProperty",))
op("attemptOutcome", "DeadlineAttempt", "DeadlineAttemptOutcome", "attempt outcome", chars=("FunctionalProperty",))
op("aboutField", "FairnessFlag", "FairnessField", "about field", chars=("FunctionalProperty",))
op("hasSeverity", "FairnessFlag", "Severity", "has severity", chars=("FunctionalProperty",))
op("hasFlagStatus", "FairnessFlag", "FlagStatus", "has flag status", chars=("FunctionalProperty",))
op("summaryConfidence", "AISummary", "Confidence", "summary confidence", chars=("FunctionalProperty",))

# vendor
op("interestedIn", "VendorProfile", "TorCategory", "interested in", "TOR categories the vendor wants to be matched against (FR-30).")
op("hasSavedSearch", "VendorProfile", "SavedSearch", "has saved search")
op("hasHiddenTorEntry", "VendorProfile", "HiddenTorEntry", "has hidden TOR entry")
op("hiddenTor", "HiddenTorEntry", "TOR", "hidden TOR", chars=("FunctionalProperty",))
op("hasDayNote", "VendorProfile", "DayNote", "has day note")
op("hasBudgetRange", "VendorProfile", "BudgetRange", "has budget range", chars=("FunctionalProperty",))
op("bookmarkOf", "Bookmark", "VendorProfile", "bookmark of", inverse=("hasBookmark", "has bookmark"),
   chars=("FunctionalProperty",))
op("bookmarkedTor", "Bookmark", "TOR", "bookmarked TOR", chars=("FunctionalProperty",))
op("hasApplicationStatus", "Bookmark", "ApplicationStatus", "has application status", chars=("FunctionalProperty",))
op("notifiesVendor", "Notification", "VendorProfile", "notifies vendor", chars=("FunctionalProperty",))
op("notificationAbout", "Notification", "TOR", "notification about", chars=("FunctionalProperty",))
op("notificationType", "Notification", "NotificationType", "notification type", chars=("FunctionalProperty",))
op("raisedBySavedSearch", "Notification", "SavedSearch", "raised by saved search")
op("matchOfVendor", "MatchResult", "VendorProfile", "match of vendor", chars=("FunctionalProperty",))
op("matchOfTor", "MatchResult", "TOR", "match of TOR", chars=("FunctionalProperty",))
op("metCriterion", "MatchResult", "MatchCriterion", "met criterion")

# admin & operations
op("notifiesAdmin", "AdminNotification", "AdminUser", "notifies admin", chars=("FunctionalProperty",))
op("adminNotificationType", "AdminNotification", "AdminNotificationType", "admin notification type",
   chars=("FunctionalProperty",))
op("aboutRun", ["AdminNotification", "SystemLog"], "IngestionRun", "about run", chars=("FunctionalProperty",))
op("reportsTor", "ErrorReport", "TOR", "reports TOR", chars=("FunctionalProperty",))
op("reportedBy", "ErrorReport", "UserAccount", "reported by", "Null when the reporter was not signed in.",
   chars=("FunctionalProperty",))
op("resolvedBy", "ErrorReport", "AdminUser", "resolved by", chars=("FunctionalProperty",))
op("hasReportStatus", "ErrorReport", "ReportStatus", "has report status", chars=("FunctionalProperty",))
op("hasPhase", "IngestionRun", "IngestionPhase", "has phase", chars=("FunctionalProperty",))
op("hasRunStatus", "IngestionRun", "IngestionStatus", "has run status", chars=("FunctionalProperty",))
op("hasTrigger", "IngestionRun", "IngestionTrigger", "has trigger", chars=("FunctionalProperty",))
op("triggeredBy", "IngestionRun", "AdminUser", "triggered by", chars=("FunctionalProperty",))
op("enrichesTor", "EnrichmentJob", "TOR", "enriches TOR", "One job per TOR (unique torId).",
   chars=("FunctionalProperty", "InverseFunctionalProperty"))
op("hasJobStatus", "EnrichmentJob", "EnrichmentJobStatus", "has job status", chars=("FunctionalProperty",))
op("logSource", "SystemLog", "LogSource", "log source", chars=("FunctionalProperty",))
op("logSeverity", "SystemLog", "LogSeverity", "log severity", chars=("FunctionalProperty",))
op("conversationOf", "ChatConversation", "UserAccount", "conversation of",
   "One conversation per user (unique index).", chars=("FunctionalProperty", "InverseFunctionalProperty"))
op("chatStatus", "ChatConversation", "ChatStatus", "chat status", chars=("FunctionalProperty",))
op("inConversation", "ChatMessage", "ChatConversation", "in conversation", inverse=("hasMessage", "has message"),
   chars=("FunctionalProperty",))
op("sentBy", "ChatMessage", "UserAccount", "sent by", chars=("FunctionalProperty",))
op("senderSide", "ChatMessage", "ChatSender", "sender side", chars=("FunctionalProperty",))
op("authoredBy", ["HelpAnnouncement", "Faq"], "AdminUser", "authored by")
op("helpCategory", "Faq", "HelpCategory", "help category", chars=("FunctionalProperty",))
op("helpStatus", ["HelpAnnouncement", "Faq"], "HelpContentStatus", "help status", chars=("FunctionalProperty",))
op("announcementType", "HelpAnnouncement", "HelpAnnouncementKind", "announcement type", chars=("FunctionalProperty",))

# application structure
op("availableTo", "Feature", "Role", "available to")
op("realizedBy", "Feature", "ApiEndpoint", "realized by", inverse=("realizes", "realizes"))
op("shownOn", "Feature", ["FrontendPage", "BrowserExtension"], "shown on")
op("usesData", ["Feature", "ApiEndpoint", "PipelineStage"], "MongoCollection", "uses data")
op("implementedIn", ["Feature", "PipelineStage"], "SourceModule", "implemented in")
op("partOfRouter", "ApiEndpoint", "ApiRouter", "part of router", chars=("FunctionalProperty",))
op("servedBy", "ApiRouter", "BackendApi", "served by")
op("precedes", "PipelineStage", "PipelineStage", "precedes", "The output of this stage feeds the next.",
   chars=("TransitiveProperty",))
op("subStageOf", "PipelineStage", "PipelineStage", "sub-stage of")
op("runsOn", "PipelineStage", ["BatchJob", "BackendApi", "BrowserExtension"], "runs on")
op("readsFrom", "PipelineStage", "ExternalService", "reads from")
op("callsService", "PipelineStage", "ExternalService", "calls service")
op("dependsOn", "SystemComponent", "SystemComponent", "depends on", chars=("TransitiveProperty",))
op("storedIn", "MongoCollection", "Datastore", "stored in", chars=("FunctionalProperty",))

# data properties
dp("title", ["TOR", "HelpAnnouncement"], XSD.string, "title")
dp("projectCode", "TOR", XSD.string, "project code", "e-GP project number; unique.", functional=True)
dp("agencyName", "TOR", XSD.string, "agency", functional=True)
dp("budgetBaht", "TOR", XSD.decimal, "budget (THB)", functional=True)
dp("referencePriceBaht", "TOR", XSD.decimal, "reference price (THB)", "ราคากลาง.", functional=True)
dp("announcementDate", "TOR", XSD.dateTime, "announcement date", functional=True)
dp("deadlineDate", "BidDeadline", XSD.dateTime, "deadline date", functional=True)
dp("technology", ["TOR", "VendorProfile"], XSD.string, "technology", "One entry of `technologyStack`.")
dp("viewCount", "TOR", XSD.nonNegativeInteger, "view count", functional=True)
dp("summaryText", "AISummary", XSD.string, "summary text", functional=True)
dp("flagMessage", "FairnessFlag", XSD.string, "flag message", "Neutral wording only.", functional=True)
dp("email", "UserAccount", XSD.string, "email", functional=True)
dp("companyName", "VendorProfile", XSD.string, "company name", functional=True)
dp("budgetMin", "BudgetRange", XSD.decimal, "budget minimum", functional=True)
dp("budgetMax", "BudgetRange", XSD.decimal, "budget maximum", functional=True)
dp("matchScore", "MatchResult", XSD.decimal, "match score", "0–100.", functional=True)
dp("sha256", "SourceDocument", XSD.string, "sha256", functional=True)
dp("maxAttempts", "EnrichmentJob", XSD.positiveInteger, "max attempts", functional=True)

# --------------------------------------------------------------------------- enumerations

E = {}
E["status"] = enum("TorDisplayStatus", "TOR display status", "User-facing lifecycle status of a TOR.", "Status", [
    ("draft", "Draft TOR", "ร่าง TOR"), ("open", "Open", "เปิดรับ"), ("closing_soon", "Closing soon", "ใกล้ปิดรับ"),
    ("closed", "Closed", "ปิดรับแล้ว"), ("awarded", "Awarded", "ประกาศผู้ชนะแล้ว"), ("cancelled", "Cancelled", "ยกเลิก"),
], "backend/src/utils/torStatus.ts", th="สถานะ TOR")
E["stage"] = enum("ProcurementStage", "Procurement stage", "Stage of the procurement read from e-GP announcements.", "Stage", [
    ("draft", "Draft", None), ("inviting", "Inviting bids", None), ("awarded", "Awarded", None), ("cancelled", "Cancelled", None),
], "Tor.procurement.stage")
E["pipeline"] = enum("PipelineStatus", "Pipeline status", "Where a TOR is in the AI pipeline; only `enriched` TORs are public.", "Pipeline", [
    ("pending", "Pending", None), ("processing", "Processing", None), ("enriched", "Enriched", None),
    ("rejected", "Rejected (not software)", None), ("failed", "Failed", None),
], "Tor.pipelineStatus")
E["source"] = enum("ProcurementSource", "Procurement source", "Which e-GP wrote the procurement stage.", "Source", [
    ("egp2", "BMA e-GP (egp2.bangkok.go.th)", None), ("gproc", "National e-GP (gprocurement.go.th)", None),
], "Tor.procurement.source")
E["layer"] = enum("TextLayer", "Text layer", "Whether the stored PDF has extractable text.", "Layer", [
    ("digital", "Digital", None), ("scanned", "Scanned", None), ("unreadable", "Unreadable", None), ("missing", "Missing", None),
], "Tor.sourceDocument.textLayer (ingestion/pdfInspect.ts)")
E["dockind"] = enum("DocumentKind", "Document kind", "Which file was stored as the TOR document.", "DocKind", [
    ("tor", "TOR file", None), ("invitation", "Invitation file (fallback)", None),
], "Tor.sourceDocument.kind")
E["ann"] = enum("ProcurementAnnouncementKind", "Announcement kind", "Kind of an e-GP announcement.", "AnnKind", [
    ("tor-draft", "TOR draft", None), ("bidding-draft", "Bidding document draft", None),
    ("reference-price", "Reference price", None), ("invitation", "Invitation", None),
    ("cancellation", "Cancellation", None), ("winner", "Winner", None), ("plan", "Procurement plan", None),
    ("unknown", "Unknown", None),
], "ANNOUNCEMENT_KINDS in Tor.ts")
E["dsrc"] = enum("BidDeadlineSource", "Bid deadline source", "Who set the bid deadline; an admin value always wins.", "DeadlineSrc", [
    ("invitation-pdf", "Read from the invitation PDF", None), ("admin", "Set by an admin", None),
], "Tor.procurement.bidDeadline.source")
E["prec"] = enum("DeadlinePrecision", "Deadline precision", "A month-only deadline is never shown as closing soon.", "Precision", [
    ("day", "Day", None), ("month", "Month only", None),
], "Tor.procurement.bidDeadline.precision")
E["outcome"] = enum("DeadlineAttemptOutcome", "Deadline attempt outcome", "Result of reading a bid deadline.", "Attempt", [
    ("read", "Read", None), ("unreadable", "Unreadable", None),
], "Tor.procurement.deadlineAttempt.outcome")
E["field"] = enum("FairnessField", "Fairness field", "The TOR field a fairness flag is about.", "Field", [
    ("budget", "Budget", None), ("deadline", "Deadline", None), ("category", "Category", None), ("agency", "Agency", None),
    ("title", "Title", None), ("qualificationRequirements", "Qualification requirements", None), ("other", "Other", None),
], "fairnessFlagSchema in Tor.ts")
E["sev"] = enum("Severity", "Severity", "Severity of a fairness flag.", "Severity", [
    ("low", "Low", None), ("medium", "Medium", None), ("high", "High", None),
], "fairnessFlagSchema in Tor.ts")
E["fstatus"] = enum("FlagStatus", "Flag status", "Review state of a fairness flag.", "FlagStatus", [
    ("open", "Open", None), ("acknowledged", "Acknowledged", None), ("dismissed", "Dismissed", None),
], "fairnessFlagSchema in Tor.ts")
E["conf"] = enum("Confidence", "Confidence", "Confidence of an AI summary.", "Confidence", [
    ("high", "High", None), ("medium", "Medium", None), ("low", "Low", None),
], "aiSummarySchema in Tor.ts")
E["cat"] = enum("TorCategory", "TOR category", "Subject-matter taxonomy set by the AI (version 2026-08-31).", "Category", [
    ("software-development", "Software development", "พัฒนาระบบซอฟต์แวร์"),
    ("web-application", "Web application", "พัฒนาเว็บไซต์และแอปพลิเคชัน"),
    ("mobile-application", "Mobile application", "แอปพลิเคชันมือถือ"),
    ("information-system", "Information system", "ระบบสารสนเทศ"),
    ("data-platform-analytics", "Data platform & analytics", "ข้อมูลและระบบวิเคราะห์"),
    ("gis", "GIS", "ระบบภูมิสารสนเทศ (GIS)"),
    ("cctv-its", "CCTV & intelligent traffic", "กล้องวงจรปิดและจราจรอัจฉริยะ"),
    ("iot-sensor", "IoT & sensors", "IoT และเซนเซอร์"),
    ("cloud-infrastructure", "Cloud infrastructure", "โครงสร้างพื้นฐานและคลาวด์"),
    ("network-datacenter", "Network & data center", "เครือข่ายและดาต้าเซ็นเตอร์"),
    ("cybersecurity", "Cybersecurity", "ความมั่นคงปลอดภัยไซเบอร์"),
    ("erp-back-office", "ERP & back office", "ระบบ ERP และงานหลังบ้าน"),
    ("hospital-information-system", "Hospital information system", "ระบบสารสนเทศโรงพยาบาล"),
    ("e-learning", "e-Learning", "ระบบ e-Learning"),
    ("chatbot-line-oa", "Chatbot & LINE OA", "แชทบอทและ Line OA"),
    ("software-license", "Software license", "จัดซื้อลิขสิทธิ์ซอฟต์แวร์"),
    ("system-maintenance", "System maintenance", "บำรุงรักษาระบบ"),
    ("it-consulting-sa", "IT consulting", "ที่ปรึกษาด้านดิจิทัล"),
    ("hardware-with-software", "Hardware with software", "จัดซื้อครุภัณฑ์ไอที"),
    ("other", "Other", "อื่นๆ"),
], "backend/src/config/taxonomy.ts", th="หมวดหมู่")
E["ptype"] = enum("ProjectType", "Project type", "Kind of engagement, orthogonal to the category (FR-6).", "ProjectType", [
    ("new-development", "New development", "พัฒนาระบบใหม่"), ("enhancement", "Enhancement", "ปรับปรุงระบบเดิม"),
    ("maintenance", "Maintenance", "บำรุงรักษาระบบ"), ("license-purchase", "License purchase", "จัดซื้อลิขสิทธิ์"),
    ("hardware-purchase", "Hardware purchase", "จัดซื้อครุภัณฑ์"), ("consulting", "Consulting", "จ้างที่ปรึกษา"),
], "backend/src/config/projectTypes.ts")
E["app"] = enum("ApplicationStatus", "Application status", "Where the vendor is with a bookmarked TOR.", "AppStatus", [
    ("interested", "Interested", "สนใจ"), ("preparing", "Preparing documents", "กำลังเตรียมเอกสาร"),
    ("submitted", "Submitted", "ยื่นแล้ว"), ("missed", "Missed", "พลาด"),
], "Bookmark.applicationStatus")
E["ntype"] = enum("NotificationType", "Notification type", "Why a vendor was notified.", "NotifType", [
    ("profile_match", "Matches the profile", None), ("saved_search_match", "Matches a saved search", None),
    ("deadline_reminder", "Deadline reminder", None),
], "Notification.type")
E["antype"] = enum("AdminNotificationType", "Admin notification type", "Why an admin was notified.", "AdminNotifType", [
    ("pipeline_run_failed", "Pipeline run failed", None),
], "AdminNotification.type")
E["rstatus"] = enum("ReportStatus", "Report status", "State of an error report.", "ReportStatus", [
    ("open", "Open", None), ("resolved", "Resolved", None),
], "ErrorReport.status")
E["method"] = enum("SessionMethod", "Sign-in method", "How the session was signed in.", "SignIn", [
    ("password", "Email and password", None), ("google", "Google", None),
], "Session.method")
E["phase"] = enum("IngestionPhase", "Ingestion phase", "Which pipeline phase a run belongs to.", "Phase", [
    ("discovery", "Discovery", None), ("enrichment", "Enrichment", None), ("lifecycle", "Lifecycle refresh", None),
    ("capture", "Capture", None),
], "IngestionRun.phase")
E["rs"] = enum("IngestionStatus", "Run status", "Outcome of an ingestion run.", "RunStatus", [
    ("running", "Running", None), ("success", "Success", None), ("partial", "Partial", None), ("failed", "Failed", None),
], "IngestionRun.status")
E["trig"] = enum("IngestionTrigger", "Run trigger", "What started a run.", "Trigger", [
    ("scheduled", "Scheduled", None), ("manual", "Manual (admin)", None),
], "IngestionRun.trigger")
E["job"] = enum("EnrichmentJobStatus", "Enrichment job status", "State of an enrichment job.", "JobStatus", [
    ("queued", "Queued", None), ("processing", "Processing", None), ("done", "Done", None),
    ("failed", "Failed", None), ("rejected", "Rejected", None),
], "EnrichmentJob.status")
E["lsrc"] = enum("LogSource", "Log source", "Which part of the system wrote a log entry.", "LogSource", [
    ("ingestion", "Ingestion", None), ("ai-pipeline", "AI pipeline", None), ("application", "Application", None),
], "SystemLog.source")
E["lsev"] = enum("LogSeverity", "Log severity", "Severity of a log entry.", "LogSeverity", [
    ("info", "Info", None), ("warning", "Warning", None), ("error", "Error", None),
], "SystemLog.severity")
E["chat"] = enum("ChatStatus", "Chat status", "Whether a conversation is open.", "ChatStatus", [
    ("open", "Open", None), ("closed", "Closed", None),
], "ChatConversation.status")
E["sender"] = enum("ChatSender", "Chat sender", "Which side sent a message.", "Sender", [
    ("visitor", "User", None), ("admin", "Admin", None),
], "ChatMessage.from")
E["hcat"] = enum("HelpCategory", "Help category", "Help-center FAQ category.", "HelpCat", [
    ("getting-started", "Getting started", "เริ่มต้นใช้งาน"), ("search", "Search and filters", "การค้นหาและตัวกรอง TOR"),
    ("tor-details", "TOR details and status", "รายละเอียด TOR และสถานะ"),
    ("ai-summary", "AI summary and review signals", "สรุปด้วย AI และสัญญาณที่ควรตรวจสอบ"),
    ("vendor-profile", "Business profile and recommendations", "โปรไฟล์ธุรกิจและ TOR ที่แนะนำ"),
    ("saved-tracking", "Saving, tracking and hiding TORs", "บันทึก ติดตามสถานะ และซ่อน TOR"),
    ("account-security", "Account and security", "บัญชีและความปลอดภัย"),
    ("data-reports", "Data sources and error reports", "แหล่งข้อมูลและการแจ้งข้อมูลคลาดเคลื่อน"),
], "backend/src/config/helpCategories.ts")
E["hstatus"] = enum("HelpContentStatus", "Help content status", "Whether help content is visible.", "HelpStatus", [
    ("draft", "Draft", None), ("published", "Published", None),
], "Announcement.status / Faq.status")
E["hkind"] = enum("HelpAnnouncementKind", "Announcement type", "Kind of help-center announcement.", "HelpKind", [
    ("news", "News", None), ("update", "Update", None), ("maintenance", "Maintenance", "ปิดปรับปรุง"),
], "Announcement.kind")
E["crit"] = enum("MatchCriterion", "Match criterion", "A weighted signal of the match score.", "Criterion", [
    ("category", "Category", "หมวดหมู่"), ("technologyStack", "Technology stack", "เทคโนโลยี"),
    ("budgetRange", "Budget range", "งบประมาณ"),
], "backend/src/services/matching.ts")
for code, w in (("category", 40), ("technologyStack", 35), ("budgetRange", 25)):
    g.add((TOR[E["crit"][code]], TOR.weight, Literal(w, datatype=XSD.integer)))

# Roles and access levels (closed sets, but typed as Role / AccessLevel rather than Enumeration)
for n, en, th, code in (("PublicRole", "Public", "บุคคลทั่วไป", "public"),
                        ("VendorRole", "Vendor", "ผู้ประกอบการ", "vendor"),
                        ("AdminRole", "Admin", "ผู้ดูแลระบบ", "admin")):
    ind(n, "Role", en, th)
all_different(["PublicRole", "VendorRole", "AdminRole"])
lst = BNode()
Collection(g, lst, [TOR.PublicRole, TOR.VendorRole, TOR.AdminRole])
one = BNode()
g.add((one, RDF.type, OWL.Class))
g.add((one, OWL.oneOf, lst))
g.add((TOR.Role, OWL.equivalentClass, one))

ACCESS = {
    "Anonymous": ("Anyone", "No sign-in needed.", ["PublicRole", "VendorRole", "AdminRole"]),
    "OptionalAuth": ("Anyone, personalised when signed in", "optionalAuth: a signed-in vendor gets personal results.",
                     ["PublicRole", "VendorRole", "AdminRole"]),
    "Authenticated": ("Signed-in user", "requireAuth", ["VendorRole", "AdminRole"]),
    "VendorOrAdmin": ("Vendor or admin", "requireAuth + requireRole(\"vendor\", \"admin\")", ["VendorRole", "AdminRole"]),
    "VendorOnly": ("Vendor only", "requireAuth + requireRole(\"vendor\")", ["VendorRole"]),
    "AdminOnly": ("Admin only", "requireAuth + requireRole(\"admin\")", ["AdminRole"]),
}
for n, (en, c, roles) in ACCESS.items():
    ind(n, "AccessLevel", en, comment=c, grantedTo=roles)
all_different(list(ACCESS))

# --------------------------------------------------------------------------- class axioms

restrict("UserAccount", "hasRole", "exactly", "Role", 1)
restrict("VendorUser", "hasRole", "value", "VendorRole")
restrict("AdminUser", "hasRole", "value", "AdminRole")
restrict("VendorProfile", "profileOf", "exactly", "VendorUser", 1)
restrict("TOR", "hasPipelineStatus", "exactly", "PipelineStatus", 1)
restrict("TOR", "hasDisplayStatus", "exactly", "TorDisplayStatus", 1)
restrict("TOR", "hasFairnessFlag", "only", "FairnessFlag")
restrict("TOR", "similarTo", "only", "TOR")
restrict("ProcurementRecord", "hasStage", "exactly", "ProcurementStage", 1)
restrict("BidDeadline", "deadlineSource", "exactly", "BidDeadlineSource", 1)
restrict("FairnessFlag", "aboutField", "exactly", "FairnessField", 1)
restrict("FairnessFlag", "hasSeverity", "exactly", "Severity", 1)
restrict("FairnessFlag", "hasFlagStatus", "exactly", "FlagStatus", 1)
restrict("FairnessFlag", "flagOn", "exactly", "TOR", 1)
restrict("Bookmark", "bookmarkOf", "exactly", "VendorProfile", 1)
restrict("Bookmark", "bookmarkedTor", "exactly", "TOR", 1)
restrict("Bookmark", "hasApplicationStatus", "exactly", "ApplicationStatus", 1)
restrict("Notification", "notifiesVendor", "exactly", "VendorProfile", 1)
restrict("Notification", "notificationAbout", "exactly", "TOR", 1)
restrict("ErrorReport", "reportsTor", "exactly", "TOR", 1)
restrict("ErrorReport", "hasReportStatus", "exactly", "ReportStatus", 1)
restrict("Session", "sessionOf", "exactly", "UserAccount", 1)
restrict("EnrichmentJob", "enrichesTor", "exactly", "TOR", 1)
restrict("IngestionRun", "hasPhase", "exactly", "IngestionPhase", 1)
restrict("ChatMessage", "inConversation", "exactly", "ChatConversation", 1)
restrict("MatchResult", "matchOfVendor", "exactly", "VendorProfile", 1)
restrict("MatchResult", "matchOfTor", "exactly", "TOR", 1)
restrict("ApiEndpoint", "requiresAccess", "exactly", "AccessLevel", 1)
restrict("ApiEndpoint", "partOfRouter", "exactly", "ApiRouter", 1)
restrict("Feature", "availableTo", "some", "Role")

defined("AdminEndpoint", "Admin endpoint", "An endpoint only admins may call (inferred).",
        "ApiEndpoint", "requiresAccess", value="AdminOnly")
defined("PublicEndpoint", "Public endpoint", "An endpoint anyone may call without signing in (inferred).",
        "ApiEndpoint", "requiresAccess", value="Anonymous")
defined("VendorFeature", "Vendor feature", "A feature vendors can use (inferred).", "Feature", "availableTo",
        value="VendorRole")
defined("AdminFeature", "Admin feature", "A feature admins can use (inferred).", "Feature", "availableTo",
        value="AdminRole")
defined("PublicFeature", "Public feature", "A feature usable without an account (inferred).", "Feature", "availableTo",
        value="PublicRole")
defined("PubliclyListedTor", "Publicly listed TOR", "A TOR the public API returns: only enriched TORs (inferred).",
        "TOR", "hasPipelineStatus", value=E["pipeline"]["enriched"])
defined("FlaggedTor", "Flagged TOR", "A TOR with at least one fairness flag (inferred).", "TOR", "hasFairnessFlag",
        some="FairnessFlag")
defined("OpenForBidsTor", "TOR open for bids", "A TOR whose display status is open (inferred).",
        "TOR", "hasDisplayStatus", value=E["status"]["open"])
defined("AIStage", "AI stage", "A pipeline stage that calls Gemini (inferred).", "PipelineStage", "callsService",
        value="GeminiVertexAI")

# --------------------------------------------------------------------------- system components

COMPONENTS = [
    # name, class, label, comment, cloud run name, dependsOn
    ("WebFrontend", "FrontendApp", "Web frontend", "Next.js 16, React 19, Tailwind v4 (frontend/).", None, ["ExpressApi"]),
    ("ExpressApi", "BackendApi", "Express API", "Express 5, Mongoose 9, TypeScript (backend/). Cloud Run service.", "tor-api",
     ["MongoDBAtlas", "CloudStorage", "SendGrid", "GoogleOAuth", "GeminiVertexAI", "NationalEGP", "SecretManager"]),
    ("DiscoveryJob", "BatchJob", "Discovery job", "dist/jobs/discovery.js", "tor-discovery",
     ["MongoDBAtlas", "CloudStorage", "BmaEGP", "CloudScheduler"]),
    ("EnrichmentBatchJob", "BatchJob", "Enrichment job", "dist/jobs/enrichment.js", "tor-enrichment",
     ["MongoDBAtlas", "CloudStorage", "GeminiVertexAI", "SendGrid", "CloudScheduler", "NationalEGP", "BmaEGP"]),
    ("LifecycleJob", "BatchJob", "Lifecycle job", "dist/jobs/lifecycle.js", "tor-lifecycle",
     ["MongoDBAtlas", "CloudStorage", "GeminiVertexAI", "NationalEGP", "BmaEGP", "CloudScheduler"]),
    ("StalledRunsJob", "BatchJob", "Stalled-runs job", "dist/jobs/stalledRuns.js: fails and logs stalled runs.", None,
     ["MongoDBAtlas"]),
    ("CaptureExtension", "BrowserExtension", "e-GP capture extension", "Chrome MV3 extension (extension/).", None,
     ["ExpressApi", "NationalEGP"]),
    ("MongoDBAtlas", "Datastore", "MongoDB Atlas", "The database; only the backend connects to it.", None, []),
    ("CloudStorage", "Datastore", "Google Cloud Storage", "TOR PDFs and avatars (STORAGE_DRIVER=gcs; local disk in dev).", None, []),
    ("SecretManager", "Datastore", "Secret Manager", "Holds MONGODB_URI, JWT_SECRET and API keys.", None, []),
    ("BmaEGP", "ExternalService", "BMA e-GP", "egp2.bangkok.go.th public API.", None, []),
    ("NationalEGP", "ExternalService", "National e-GP", "gprocurement.go.th / process5.", None, []),
    ("GeminiVertexAI", "ExternalService", "Gemini on Vertex AI", "@google/genai multimodal model.", None, []),
    ("SendGrid", "ExternalService", "SendGrid", "Password-reset and match-digest e-mail.", None, []),
    ("GoogleOAuth", "ExternalService", "Google OAuth / OIDC", "Sign in with Google.", None, []),
    ("CloudScheduler", "ExternalService", "Cloud Scheduler", "Starts the Cloud Run jobs on a cron schedule.", None, []),
]
for n, c, en, comment, cr, deps in COMPONENTS:
    i = ind(n, c, en, comment=comment, dependsOn=deps)
    if cr:
        g.add((i, TOR.cloudRunName, Literal(cr)))
all_different([c[0] for c in COMPONENTS])

# --------------------------------------------------------------------------- collections

COLLECTIONS = {}
for cname, coll in [("UserAccount", "users")] + [(k, v[2]) for k, v in PERSISTENT.items()]:
    n = "Collection_" + coll
    COLLECTIONS[coll] = n
    i = ind(n, "MongoCollection", coll, collectionName=Literal(coll), storedIn="MongoDBAtlas")
    g.add((i, TOR.storesInstancesOf, TOR[cname]))
all_different(list(COLLECTIONS.values()))


def colls(*names):
    return [COLLECTIONS[n] for n in names]


# --------------------------------------------------------------------------- source modules

MODULES = {
    "Mod_Models": "backend/src/models/",
    "Mod_App": "backend/src/app.ts",
    "Mod_AuthMiddleware": "backend/src/middleware/auth.ts",
    "Mod_AuthController": "backend/src/controllers/authController.ts",
    "Mod_Sessions": "backend/src/services/sessions.ts",
    "Mod_TorController": "backend/src/controllers/torController.ts",
    "Mod_TorDocument": "backend/src/controllers/torDocumentController.ts",
    "Mod_ErrorReport": "backend/src/controllers/errorReportController.ts",
    "Mod_VendorProfile": "backend/src/controllers/vendorProfileController.ts",
    "Mod_Matching": "backend/src/services/matching.ts",
    "Mod_MatchController": "backend/src/controllers/matchController.ts",
    "Mod_Bookmarks": "backend/src/controllers/bookmarkController.ts",
    "Mod_HiddenTors": "backend/src/controllers/hiddenTorController.ts",
    "Mod_DayNotes": "backend/src/controllers/dayNoteController.ts",
    "Mod_Notifications": "backend/src/notifications/",
    "Mod_NotificationController": "backend/src/controllers/notificationController.ts",
    "Mod_Email": "backend/src/email/",
    "Mod_Storage": "backend/src/storage/",
    "Mod_Help": "backend/src/controllers/helpController.ts",
    "Mod_AdminHelp": "backend/src/controllers/adminHelpController.ts",
    "Mod_Chat": "backend/src/services/chat.ts",
    "Mod_AdminStats": "backend/src/controllers/adminStatsController.ts",
    "Mod_AdminTors": "backend/src/controllers/adminTorController.ts",
    "Mod_AdminReports": "backend/src/controllers/adminReportController.ts",
    "Mod_AdminLogs": "backend/src/controllers/adminLogController.ts",
    "Mod_AdminNotifications": "backend/src/controllers/adminNotificationController.ts",
    "Mod_IngestionController": "backend/src/controllers/ingestionController.ts",
    "Mod_EgpClient": "backend/src/scraper/egpClient.ts",
    "Mod_GprocClient": "backend/src/scraper/gprocClient.ts",
    "Mod_RunIngestion": "backend/src/ingestion/runIngestion.ts",
    "Mod_KeywordGate": "backend/src/ingestion/softwareKeywordGate.ts",
    "Mod_PdfInspect": "backend/src/ingestion/pdfInspect.ts",
    "Mod_Capture": "backend/src/ingestion/capture/",
    "Mod_Enrichment": "backend/src/ingestion/enrichment/",
    "Mod_Taxonomy": "backend/src/config/taxonomy.ts",
    "Mod_Lifecycle": "backend/src/ingestion/lifecycle/",
    "Mod_DeadlineStep": "backend/src/ingestion/lifecycle/deadlineStep.ts",
    "Mod_ProcurementStage": "backend/src/ingestion/procurementStage.ts",
    "Mod_StalledRuns": "backend/src/ingestion/stalledRuns.ts",
    "Mod_AdminAlerts": "backend/src/ingestion/adminAlerts.ts",
    "Mod_TorStatus": "backend/src/utils/torStatus.ts",
    "Mod_Extension": "extension/",
    "Mod_UseAuth": "frontend/src/lib/useAuth.ts",
    "Mod_DeadlineCalendar": "frontend/src/components/DeadlineCalendar.tsx",
    "Mod_ChatWidget": "frontend/src/components/AdminChatWidget.tsx",
}
for n, path in MODULES.items():
    ind(n, "SourceModule", path, filePath=Literal(path))

# --------------------------------------------------------------------------- frontend pages

PAGES = {
    # name: (route, access, label)
    "Page_Home": ("/", "Anonymous", "Home"),
    "Page_TorList": ("/tor", "OptionalAuth", "TOR search"),
    "Page_TorDetail": ("/tor/[id]", "OptionalAuth", "TOR detail"),
    "Page_Login": ("/login", "Anonymous", "Sign in"),
    "Page_Signup": ("/signup", "Anonymous", "Sign up"),
    "Page_ForgotPassword": ("/forgot-password", "Anonymous", "Forgot password"),
    "Page_ResetPassword": ("/reset-password", "Anonymous", "Reset password"),
    "Page_Dashboard": ("/dashboard", "Authenticated", "Vendor dashboard"),
    "Page_Bookmarks": ("/bookmarks", "Authenticated", "Bookmarks"),
    "Page_Profile": ("/account/profile", "Authenticated", "Business profile"),
    "Page_Settings": ("/account/settings", "Authenticated", "Account settings"),
    "Page_Help": ("/help", "Anonymous", "Help center"),
    "Page_HelpAnnouncements": ("/help/announcements", "Anonymous", "Announcements"),
    "Page_HelpAnnouncement": ("/help/announcements/[id]", "Anonymous", "Announcement"),
    "Page_HelpFaqs": ("/help/faq", "Anonymous", "FAQs"),
    "Page_HelpFaq": ("/help/faq/[id]", "Anonymous", "FAQ"),
    "Page_PrivacyPolicy": ("/privacy-policy", "Anonymous", "Privacy policy"),
    "Page_TermsOfUse": ("/terms-of-use", "Anonymous", "Terms of use"),
    "Page_AdminOverview": ("/admin", "AdminOnly", "Admin overview"),
    "Page_AdminRecords": ("/admin/records", "AdminOnly", "Admin TOR records"),
    "Page_AdminReports": ("/admin/reports", "AdminOnly", "Admin error reports"),
    "Page_AdminLogs": ("/admin/logs", "AdminOnly", "Admin system logs"),
    "Page_AdminScraper": ("/admin/scraper", "AdminOnly", "Admin ingestion"),
    "Page_AdminChats": ("/admin/chats", "AdminOnly", "Admin chats"),
    "Page_AdminHelp": ("/admin/help", "AdminOnly", "Admin help editor"),
}
for n, (route, access, en) in PAGES.items():
    ind(n, "FrontendPage", en, routePath=Literal(route), requiresAccess=access)

# --------------------------------------------------------------------------- features

FEATURES = {
    # name: (label, thai, roles, pages, modules, collections, comment)
    "F_TorSearch": ("Search and filter TORs", "ค้นหาและกรอง TOR", ["PublicRole", "VendorRole", "AdminRole"],
                    ["Page_TorList", "Page_Home"], ["Mod_TorController"], colls("tors"),
                    "Keyword, agency, category, technology, budget, status and deadline filters with pagination."),
    "F_TorDetail": ("TOR detail with AI summary", "รายละเอียด TOR", ["PublicRole", "VendorRole", "AdminRole"],
                    ["Page_TorDetail"], ["Mod_TorController", "Mod_TorStatus"], colls("tors"),
                    "Status, bid deadline, AI summary, key points, qualifications and similar TORs."),
    "F_TorDocument": ("Download the TOR document", None, ["PublicRole", "VendorRole", "AdminRole"],
                      ["Page_TorDetail"], ["Mod_TorDocument", "Mod_Storage"], colls("tors"), None),
    "F_PriceStats": ("Price statistics", None, ["PublicRole", "VendorRole", "AdminRole"],
                     ["Page_TorList"], ["Mod_TorController"], colls("tors"), None),
    "F_ErrorReporting": ("Report incorrect data", "แจ้งข้อมูลคลาดเคลื่อน", ["PublicRole", "VendorRole", "AdminRole"],
                         ["Page_TorDetail"], ["Mod_ErrorReport"], colls("errorreports", "tors"), None),
    "F_FairnessSignals": ("Fairness review signals", "สัญญาณที่ควรตรวจสอบ", ["AdminRole"],
                          ["Page_AdminRecords", "Page_AdminOverview"], ["Mod_Enrichment", "Mod_AdminTors"], colls("tors"),
                          "AI-raised neutral signals about budget, deadline and narrow qualifications."),
    "F_PasswordAccount": ("Sign up and sign in with email", "สมัครและเข้าสู่ระบบ", ["PublicRole", "VendorRole", "AdminRole"],
                          ["Page_Login", "Page_Signup"], ["Mod_AuthController", "Mod_UseAuth"],
                          colls("users", "sessions"), None),
    "F_GoogleSignIn": ("Sign in with Google", None, ["PublicRole", "VendorRole", "AdminRole"],
                       ["Page_Login", "Page_Signup", "Page_Settings"], ["Mod_AuthController"],
                       colls("users", "sessions"), None),
    "F_PasswordReset": ("Reset a forgotten password", "ลืมรหัสผ่าน", ["PublicRole", "VendorRole", "AdminRole"],
                        ["Page_ForgotPassword", "Page_ResetPassword"], ["Mod_AuthController", "Mod_Email"],
                        colls("users"), None),
    "F_AccountSettings": ("Account settings", "ตั้งค่าบัญชี", ["VendorRole", "AdminRole"], ["Page_Settings"],
                          ["Mod_AuthController", "Mod_Storage"], colls("users"),
                          "Display name, avatar, e-mail, password and account deletion."),
    "F_SessionManagement": ("Signed-in devices", "อุปกรณ์ที่เข้าสู่ระบบ", ["VendorRole", "AdminRole"], ["Page_Settings"],
                            ["Mod_Sessions", "Mod_AuthController"], colls("sessions"), None),
    "F_MyReports": ("My error reports", None, ["VendorRole", "AdminRole"], ["Page_Settings"],
                    ["Mod_AuthController"], colls("errorreports"), None),
    "F_VendorProfile": ("Business profile", "โปรไฟล์ธุรกิจ", ["VendorRole"], ["Page_Profile"],
                        ["Mod_VendorProfile"], colls("vendorprofiles"), "FR-22."),
    "F_Matching": ("Recommended TORs (match score)", "TOR ที่แนะนำ", ["VendorRole"], ["Page_Dashboard"],
                   ["Mod_Matching", "Mod_MatchController"], colls("vendorprofiles", "tors"),
                   "Category 40 + technology stack 35 + budget range 25 points."),
    "F_SavedSearches": ("Saved searches with alerts", None, ["VendorRole"], [],
                        ["Mod_VendorProfile"], colls("vendorprofiles"), "FR-28; API only, no page yet."),
    "F_HiddenTors": ("Hide TORs", "ซ่อน TOR", ["VendorRole"], ["Page_TorList", "Page_TorDetail"],
                     ["Mod_HiddenTors"], colls("vendorprofiles"), None),
    "F_Bookmarks": ("Bookmarks and application tracking", "บันทึกและติดตามสถานะ", ["VendorRole"],
                    ["Page_Bookmarks", "Page_TorDetail"], ["Mod_Bookmarks"], colls("bookmarks"), "FR-27, FR-31, FR-32."),
    "F_DeadlineCalendar": ("Deadline calendar with day notes", "ปฏิทิน", ["VendorRole"], ["Page_Dashboard"],
                           ["Mod_DayNotes", "Mod_DeadlineCalendar"], colls("vendorprofiles", "bookmarks"), None),
    "F_VendorNotifications": ("Match notifications and e-mail digest", "การแจ้งเตือน", ["VendorRole"], [],
                              ["Mod_Notifications", "Mod_NotificationController", "Mod_Email"],
                              colls("notifications", "vendorprofiles"), "FR-29, FR-30."),
    "F_HelpCenter": ("Help center", "ศูนย์ช่วยเหลือ", ["PublicRole", "VendorRole", "AdminRole"],
                     ["Page_Help", "Page_HelpAnnouncements", "Page_HelpAnnouncement", "Page_HelpFaqs", "Page_HelpFaq"],
                     ["Mod_Help"], colls("announcements", "faqs"), None),
    "F_SupportChat": ("Support chat", "แชทกับผู้ดูแล", ["VendorRole", "AdminRole"], ["Page_AdminChats"],
                      ["Mod_Chat", "Mod_ChatWidget"], colls("chatconversations", "chatmessages"),
                      "Vendors chat from a widget on every page; admins answer on /admin/chats."),
    "F_LegalPages": ("Privacy policy and terms of use", None, ["PublicRole", "VendorRole", "AdminRole"],
                     ["Page_PrivacyPolicy", "Page_TermsOfUse"], [], [], None),
    "F_AdminStats": ("Admin overview statistics", None, ["AdminRole"], ["Page_AdminOverview"],
                     ["Mod_AdminStats"], colls("tors", "users", "errorreports", "ingestionruns"), None),
    "F_AdminTorManagement": ("Edit, delete and review reported TORs", None, ["AdminRole"], ["Page_AdminRecords"],
                             ["Mod_AdminTors"], colls("tors", "errorreports"), None),
    "F_AdminErrorReports": ("Resolve error reports", None, ["AdminRole"], ["Page_AdminReports"],
                            ["Mod_AdminReports"], colls("errorreports"), None),
    "F_AdminLogs": ("System logs", None, ["AdminRole"], ["Page_AdminLogs"], ["Mod_AdminLogs"], colls("systemlogs"), None),
    "F_AdminHelpEditor": ("Edit help content", None, ["AdminRole"], ["Page_AdminHelp"], ["Mod_AdminHelp"],
                          colls("announcements", "faqs"), None),
    "F_AdminAlerts": ("Pipeline failure alerts", None, ["AdminRole"], ["Page_AdminOverview"],
                      ["Mod_AdminAlerts", "Mod_AdminNotifications"], colls("adminnotifications"), None),
    "F_IngestionControl": ("Run and monitor ingestion", None, ["AdminRole"], ["Page_AdminScraper"],
                           ["Mod_IngestionController"], colls("ingestionruns", "enrichmentjobs", "tors"),
                           "Start discovery, enrichment and lifecycle runs; see pending counts."),
    "F_ExtensionCapture": ("Capture projects from national e-GP", None, ["AdminRole"], ["CaptureExtension"],
                           ["Mod_Extension", "Mod_Capture"], colls("ingestionruns", "tors"), None),
}
for n, (en, th, roles, pages, mods, cs, comment) in FEATURES.items():
    ind(n, "Feature", en, th, comment, availableTo=roles, shownOn=pages, implementedIn=mods, usesData=cs)

# --------------------------------------------------------------------------- API endpoints

ROUTERS = {
    "health": "/api/health", "auth": "/api/auth", "vendor": "/api/vendor", "ingestion": "/api/ingestion",
    "tors": "/api/tors", "admin": "/api/admin", "chat": "/api/chat", "help": "/api/help",
}
for r, prefix in ROUTERS.items():
    ind(f"Router_{r}", "ApiRouter", prefix, servedBy="ExpressApi",
        comment=f"backend/src/routes/{r if r != 'tors' else 'tor'}Routes.ts")

A, O, U, VA, V, AD = "Anonymous", "OptionalAuth", "Authenticated", "VendorOrAdmin", "VendorOnly", "AdminOnly"
ENDPOINTS = [
    # router, method, path, access, feature, collections
    ("health", "GET", "/", A, None, []),
    ("auth", "POST", "/register", A, "F_PasswordAccount", ["users", "sessions"]),
    ("auth", "POST", "/login", A, "F_PasswordAccount", ["users", "sessions"]),
    ("auth", "POST", "/logout", A, "F_PasswordAccount", ["sessions"]),
    ("auth", "POST", "/forgot-password", A, "F_PasswordReset", ["users"]),
    ("auth", "POST", "/reset-password", A, "F_PasswordReset", ["users", "sessions"]),
    ("auth", "GET", "/me", U, "F_AccountSettings", ["users"]),
    ("auth", "PATCH", "/me", U, "F_AccountSettings", ["users"]),
    ("auth", "DELETE", "/me", U, "F_AccountSettings", ["users", "vendorprofiles", "bookmarks", "sessions"]),
    ("auth", "PUT", "/password", U, "F_AccountSettings", ["users", "sessions"]),
    ("auth", "PUT", "/email", U, "F_AccountSettings", ["users"]),
    ("auth", "POST", "/logout-others", U, "F_SessionManagement", ["sessions", "users"]),
    ("auth", "GET", "/sessions", U, "F_SessionManagement", ["sessions"]),
    ("auth", "DELETE", "/sessions/:id", U, "F_SessionManagement", ["sessions"]),
    ("auth", "GET", "/reports", U, "F_MyReports", ["errorreports"]),
    ("auth", "POST", "/avatar", U, "F_AccountSettings", ["users"]),
    ("auth", "GET", "/avatar/:userId", A, "F_AccountSettings", ["users"]),
    ("auth", "GET", "/google", A, "F_GoogleSignIn", []),
    ("auth", "GET", "/google/callback", A, "F_GoogleSignIn", ["users", "sessions"]),
    ("auth", "GET", "/google/link", U, "F_GoogleSignIn", ["users"]),
    ("auth", "DELETE", "/google", U, "F_GoogleSignIn", ["users"]),
    ("tors", "GET", "/", O, "F_TorSearch", ["tors", "vendorprofiles"]),
    ("tors", "GET", "/price-stats", A, "F_PriceStats", ["tors"]),
    ("tors", "GET", "/agencies", A, "F_TorSearch", ["tors"]),
    ("tors", "GET", "/technologies", A, "F_TorSearch", ["tors"]),
    ("tors", "GET", "/:id", A, "F_TorDetail", ["tors"]),
    ("tors", "GET", "/:id/document", A, "F_TorDocument", ["tors"]),
    ("tors", "POST", "/:id/report", O, "F_ErrorReporting", ["errorreports"]),
    ("tors", "POST", "/:id/view", A, "F_TorDetail", ["tors"]),
    ("vendor", "GET", "/profile", VA, "F_VendorProfile", ["vendorprofiles"]),
    ("vendor", "PUT", "/profile", VA, "F_VendorProfile", ["vendorprofiles"]),
    ("vendor", "GET", "/profile/saved-searches", V, "F_SavedSearches", ["vendorprofiles"]),
    ("vendor", "POST", "/profile/saved-searches", V, "F_SavedSearches", ["vendorprofiles"]),
    ("vendor", "PATCH", "/profile/saved-searches/:searchId", V, "F_SavedSearches", ["vendorprofiles"]),
    ("vendor", "DELETE", "/profile/saved-searches/:searchId", V, "F_SavedSearches", ["vendorprofiles"]),
    ("vendor", "GET", "/matches", VA, "F_Matching", ["vendorprofiles", "tors"]),
    ("vendor", "GET", "/bookmarks", VA, "F_Bookmarks", ["bookmarks", "tors"]),
    ("vendor", "PUT", "/bookmarks/:torId", VA, "F_Bookmarks", ["bookmarks"]),
    ("vendor", "PATCH", "/bookmarks/:torId", VA, "F_Bookmarks", ["bookmarks"]),
    ("vendor", "DELETE", "/bookmarks/:torId", VA, "F_Bookmarks", ["bookmarks"]),
    ("vendor", "GET", "/hidden-tors", V, "F_HiddenTors", ["vendorprofiles", "tors"]),
    ("vendor", "PUT", "/hidden-tors/:torId", V, "F_HiddenTors", ["vendorprofiles"]),
    ("vendor", "DELETE", "/hidden-tors/:torId", V, "F_HiddenTors", ["vendorprofiles"]),
    ("vendor", "GET", "/day-notes", VA, "F_DeadlineCalendar", ["vendorprofiles"]),
    ("vendor", "PUT", "/day-notes/:date", VA, "F_DeadlineCalendar", ["vendorprofiles"]),
    ("vendor", "GET", "/notifications", VA, "F_VendorNotifications", ["notifications"]),
    ("vendor", "PATCH", "/notifications/:id/read", VA, "F_VendorNotifications", ["notifications"]),
    ("chat", "GET", "/conversation", U, "F_SupportChat", ["chatconversations", "chatmessages"]),
    ("chat", "POST", "/messages", U, "F_SupportChat", ["chatconversations", "chatmessages"]),
    ("chat", "POST", "/read", U, "F_SupportChat", ["chatconversations"]),
    ("help", "GET", "/", A, "F_HelpCenter", ["announcements", "faqs"]),
    ("help", "GET", "/announcements", A, "F_HelpCenter", ["announcements"]),
    ("help", "GET", "/announcements/:id", A, "F_HelpCenter", ["announcements"]),
    ("help", "GET", "/faqs", A, "F_HelpCenter", ["faqs"]),
    ("help", "GET", "/faqs/:id", A, "F_HelpCenter", ["faqs"]),
    ("admin", "GET", "/stats", AD, "F_AdminStats", ["tors", "users", "errorreports", "ingestionruns"]),
    ("admin", "GET", "/notifications", AD, "F_AdminAlerts", ["adminnotifications"]),
    ("admin", "PATCH", "/notifications/:id/read", AD, "F_AdminAlerts", ["adminnotifications"]),
    ("admin", "GET", "/tors", AD, "F_AdminTorManagement", ["tors"]),
    ("admin", "GET", "/tors/reported", AD, "F_AdminTorManagement", ["tors", "errorreports"]),
    ("admin", "PATCH", "/tors/:id", AD, "F_AdminTorManagement", ["tors", "systemlogs"]),
    ("admin", "DELETE", "/tors/:id", AD, "F_AdminTorManagement", ["tors"]),
    ("admin", "GET", "/reports", AD, "F_AdminErrorReports", ["errorreports"]),
    ("admin", "PATCH", "/reports/:id", AD, "F_AdminErrorReports", ["errorreports"]),
    ("admin", "GET", "/logs", AD, "F_AdminLogs", ["systemlogs"]),
    ("admin", "GET", "/chats", AD, "F_SupportChat", ["chatconversations"]),
    ("admin", "PATCH", "/chats/:id", AD, "F_SupportChat", ["chatconversations"]),
    ("admin", "GET", "/chats/:id/messages", AD, "F_SupportChat", ["chatmessages"]),
    ("admin", "POST", "/chats/:id/messages", AD, "F_SupportChat", ["chatconversations", "chatmessages"]),
    ("admin", "POST", "/chats/:id/read", AD, "F_SupportChat", ["chatconversations"]),
    ("admin", "GET", "/help/announcements", AD, "F_AdminHelpEditor", ["announcements"]),
    ("admin", "POST", "/help/announcements", AD, "F_AdminHelpEditor", ["announcements"]),
    ("admin", "PATCH", "/help/announcements/:id", AD, "F_AdminHelpEditor", ["announcements"]),
    ("admin", "DELETE", "/help/announcements/:id", AD, "F_AdminHelpEditor", ["announcements"]),
    ("admin", "GET", "/help/faqs", AD, "F_AdminHelpEditor", ["faqs"]),
    ("admin", "POST", "/help/faqs", AD, "F_AdminHelpEditor", ["faqs"]),
    ("admin", "PATCH", "/help/faqs/:id", AD, "F_AdminHelpEditor", ["faqs"]),
    ("admin", "DELETE", "/help/faqs/:id", AD, "F_AdminHelpEditor", ["faqs"]),
    ("ingestion", "POST", "/runs", AD, "F_IngestionControl", ["ingestionruns", "tors", "enrichmentjobs"]),
    ("ingestion", "GET", "/runs", AD, "F_IngestionControl", ["ingestionruns"]),
    ("ingestion", "GET", "/runs/:id", AD, "F_IngestionControl", ["ingestionruns"]),
    ("ingestion", "POST", "/enrichment/runs", AD, "F_IngestionControl", ["ingestionruns", "enrichmentjobs", "tors"]),
    ("ingestion", "GET", "/enrichment/pending", AD, "F_IngestionControl", ["enrichmentjobs"]),
    ("ingestion", "POST", "/lifecycle/runs", AD, "F_IngestionControl", ["ingestionruns", "tors"]),
    ("ingestion", "GET", "/lifecycle/pending", AD, "F_IngestionControl", ["tors"]),
    ("ingestion", "POST", "/capture", AD, "F_ExtensionCapture", ["ingestionruns", "tors", "enrichmentjobs"]),
    ("ingestion", "GET", "/capture/pending", AD, "F_IngestionControl", ["tors"]),
]
EP_NAMES = []
for r, method, path, access, feature, cs in ENDPOINTS:
    full = (ROUTERS[r] + ("" if path == "/" else path))
    n = "EP_" + method + "_" + (ident(full.replace(":", "by_")) or "root")
    EP_NAMES.append(n)
    ind(n, "ApiEndpoint", f"{method} {full}", httpMethod=Literal(method), urlPath=Literal(full),
        requiresAccess=access, partOfRouter=f"Router_{r}", usesData=colls(*cs))
    if feature:
        g.add((TOR[feature], TOR.realizedBy, TOR[n]))
assert len(set(EP_NAMES)) == len(EP_NAMES), "endpoint names collide"
all_different(EP_NAMES)

# --------------------------------------------------------------------------- pipeline

STAGES = [
    # name, label, comment, runsOn, readsFrom, calls, modules, collections, precedes, subStageOf
    ("Stage_Discovery", "Discovery", "Pages the BMA e-GP API, upserts TORs by projectCode with change detection, "
     "stores the PDFs and queues enrichment jobs.", ["DiscoveryJob", "ExpressApi"], ["BmaEGP"], [],
     ["Mod_RunIngestion", "Mod_EgpClient"], colls("tors", "ingestionruns", "systemlogs", "enrichmentjobs"),
     ["Stage_Enrichment"], None),
    ("Stage_Capture", "Capture", "Admins pick projects on national e-GP with the extension; the API maps "
     "them to TORs (max 100 per call).", ["CaptureExtension", "ExpressApi"], ["NationalEGP"], [],
     ["Mod_Capture", "Mod_GprocClient", "Mod_Extension"], colls("tors", "ingestionruns", "enrichmentjobs"),
     ["Stage_Enrichment"], None),
    ("Stage_KeywordGate", "Software keyword gate", "Drops projects whose title is not software-related.",
     ["DiscoveryJob", "ExpressApi"], [], [], ["Mod_KeywordGate"], [], [], ["Stage_Discovery", "Stage_Capture"]),
    ("Stage_PdfInspection", "PDF inspection", "Tags each stored PDF as digital, scanned, unreadable or missing.",
     ["DiscoveryJob", "ExpressApi"], [], [], ["Mod_PdfInspect", "Mod_Storage"], colls("tors"), [],
     ["Stage_Discovery", "Stage_Capture"]),
    ("Stage_Enrichment", "AI enrichment", "Claims queued jobs under a lease; one Gemini multimodal call per TOR "
     "classifies it, writes the AI summary, the category and fairness flags.", ["EnrichmentBatchJob"], [],
     ["GeminiVertexAI"], ["Mod_Enrichment", "Mod_Taxonomy"], colls("tors", "enrichmentjobs", "ingestionruns", "systemlogs"),
     ["Stage_LifecycleRefresh", "Stage_MatchNotification"], None),
    ("Stage_FairnessDetection", "Fairness signal detection", "Part of the enrichment call: budget outliers vs. the "
     "reference price, short deadlines and narrow qualifications, worded neutrally.", ["EnrichmentBatchJob"], [],
     ["GeminiVertexAI"], ["Mod_Enrichment"], colls("tors"), [], ["Stage_Enrichment"]),
    ("Stage_LifecycleRefresh", "Lifecycle refresh", "Re-checks unfinished TORs' procurement stage from national "
     "e-GP first, then BMA e-GP; no Gemini call for the stage.", ["LifecycleJob", "EnrichmentBatchJob"],
     ["NationalEGP", "BmaEGP"], [], ["Mod_Lifecycle", "Mod_ProcurementStage"], colls("tors", "ingestionruns"),
     ["Stage_DeadlineExtraction"], None),
    ("Stage_DeadlineExtraction", "Bid deadline extraction", "Reads the real bid deadline from the latest invitation "
     "PDF with one small Gemini call, once per invitation.", ["LifecycleJob", "EnrichmentBatchJob"], ["NationalEGP"],
     ["GeminiVertexAI"], ["Mod_DeadlineStep"], colls("tors"), [], ["Stage_LifecycleRefresh"]),
    ("Stage_MatchNotification", "Match notification", "Notifies vendors whose profile or saved search matches "
     "newly enriched TORs, in-app and by e-mail digest.", ["EnrichmentBatchJob"], [], ["SendGrid"],
     ["Mod_Notifications", "Mod_Email"], colls("notifications", "vendorprofiles"), [], None),
    ("Stage_StalledRunDetection", "Stalled-run detection", "Fails runs that stopped reporting and alerts admins.",
     ["StalledRunsJob", "ExpressApi"], [], [], ["Mod_StalledRuns", "Mod_AdminAlerts"],
     colls("ingestionruns", "adminnotifications", "systemlogs"), [], None),
]
for n, en, comment, runs, reads, calls, mods, cs, prec, sub in STAGES:
    ind(n, "PipelineStage", en, comment=comment, runsOn=runs, readsFrom=reads, callsService=calls,
        implementedIn=mods, usesData=cs, precedes=prec, subStageOf=sub or [])
all_different([s[0] for s in STAGES])

# --------------------------------------------------------------------------- project and team

ind("TorChecker", "SoftwareProject", "TOR Checker", "ระบบรวบรวมและตรวจสอบ TOR ซอฟต์แวร์ กทม.",
    "BKK Software TOR Aggregator & Fairness Checker; course 01219325.",
    hasTeamMember=["Member_Paranyu", "Member_Pakorn", "Member_Karnpon"])
for m in ("Paranyu", "Pakorn", "Karnpon"):
    ind(f"Member_{m}", "TeamMember", m)
all_different(["Member_Paranyu", "Member_Pakorn", "Member_Karnpon"])

# --------------------------------------------------------------------------- illustrative example data

EX = "Illustrative example data, not a real record."
ind("Example_VendorUser", "VendorUser", "Example vendor account", comment=EX,
    email=Literal("vendor@example.com"), hasRole="VendorRole", ownsProfile="Example_VendorProfile")
ind("Example_BudgetRange", "BudgetRange", "Example budget range", comment=EX,
    budgetMin=Literal("500000", datatype=XSD.decimal), budgetMax=Literal("5000000", datatype=XSD.decimal))
ind("Example_VendorProfile", "VendorProfile", "Example vendor profile", comment=EX,
    companyName=Literal("Example Software Co., Ltd."), technology=[Literal("React"), Literal("Node.js")],
    interestedIn=[E["cat"]["web-application"], E["cat"]["information-system"]], hasBudgetRange="Example_BudgetRange")
ind("Example_BidDeadline", "BidDeadline", "Example bid deadline", comment=EX,
    deadlineDate=Literal("2026-11-20T16:30:00+07:00", datatype=XSD.dateTime),
    deadlineSource=E["dsrc"]["invitation-pdf"], deadlinePrecision=E["prec"]["day"])
ind("Example_Procurement", "ProcurementRecord", "Example procurement record", comment=EX,
    hasStage=E["stage"]["inviting"], stageSource=E["source"]["gproc"], hasBidDeadline="Example_BidDeadline")
ind("Example_AISummary", "AISummary", "Example AI summary", comment=EX,
    summaryText=Literal("Develop a web portal for district service requests."),
    summaryConfidence=E["conf"]["high"])
ind("Example_FairnessFlag", "FairnessFlag", "Example fairness flag", comment=EX,
    aboutField=E["field"]["deadline"], hasSeverity=E["sev"]["medium"], hasFlagStatus=E["fstatus"]["open"],
    flagMessage=Literal("The bidding period is shorter than usual for this scope; worth checking."))
ind("Example_Tor", "TOR", "Example TOR: district service web portal", comment=EX,
    title=Literal("Web portal for district service requests"), projectCode=Literal("EXAMPLE-0001"),
    agencyName=Literal("Example District Office"), budgetBaht=Literal("2500000", datatype=XSD.decimal),
    referencePriceBaht=Literal("2450000", datatype=XSD.decimal), technology=[Literal("React"), Literal("PostgreSQL")],
    inCategory=E["cat"]["web-application"], hasProjectType=E["ptype"]["new-development"],
    hasPipelineStatus=E["pipeline"]["enriched"], hasDisplayStatus=E["status"]["open"],
    hasProcurement="Example_Procurement", hasAISummary="Example_AISummary", hasFairnessFlag="Example_FairnessFlag")
ind("Example_Bookmark", "Bookmark", "Example bookmark", comment=EX, bookmarkOf="Example_VendorProfile",
    bookmarkedTor="Example_Tor", hasApplicationStatus=E["app"]["preparing"])
ind("Example_Match", "MatchResult", "Example match result", comment=EX, matchOfVendor="Example_VendorProfile",
    matchOfTor="Example_Tor", metCriterion=[E["crit"]["category"], E["crit"]["technologyStack"], E["crit"]["budgetRange"]],
    matchScore=Literal("82.5", datatype=XSD.decimal))

# --------------------------------------------------------------------------- write

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "tor-checker.owl"
    g.serialize(out, format="xml")
    print(f"wrote {out}: {len(g)} triples")
