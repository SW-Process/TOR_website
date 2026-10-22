"""Example SPARQL queries over the TOR Checker ontology.

    pip install rdflib
    python docs/ontology/sparql_examples.py docs/ontology/tor-checker.owl
"""

import sys

from rdflib import Graph

PREFIXES = """
PREFIX tor:  <https://github.com/SW-Process/TOR_website/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
"""

QUERIES = {
    "Features per role": """
        SELECT ?role (COUNT(?f) AS ?features) WHERE {
          ?f a tor:Feature ; tor:availableTo ?r . ?r rdfs:label ?role . FILTER(lang(?role) = "en")
        } GROUP BY ?role ORDER BY DESC(?features)""",
    "API endpoints per access level": """
        SELECT ?access (COUNT(?e) AS ?endpoints) WHERE {
          ?e a tor:ApiEndpoint ; tor:requiresAccess ?a . ?a rdfs:label ?access
        } GROUP BY ?access ORDER BY DESC(?endpoints)""",
    "Endpoints only a vendor may call": """
        SELECT ?endpoint WHERE {
          ?e tor:requiresAccess tor:VendorOnly ; rdfs:label ?endpoint
        } ORDER BY ?endpoint""",
    "Features that read or write the tors collection": """
        SELECT ?feature WHERE {
          ?f a tor:Feature ; tor:usesData tor:Collection_tors ; rdfs:label ?feature . FILTER(lang(?feature) = "en")
        } ORDER BY ?feature""",
    "Stages that come after discovery (transitive)": """
        SELECT ?stage WHERE {
          tor:Stage_Discovery tor:precedes+ ?s . ?s rdfs:label ?stage
        } ORDER BY ?stage""",
    "Stages that call Gemini, and where they run": """
        SELECT ?stage (GROUP_CONCAT(?runs; separator=", ") AS ?runsOn) WHERE {
          ?s tor:callsService tor:GeminiVertexAI ; rdfs:label ?stage ; tor:runsOn/rdfs:label ?runs
        } GROUP BY ?stage ORDER BY ?stage""",
    "Components that depend on MongoDB Atlas (directly or not)": """
        SELECT ?component WHERE {
          ?c tor:dependsOn+ tor:MongoDBAtlas ; rdfs:label ?component
        } ORDER BY ?component""",
    "Features with no frontend page yet": """
        SELECT ?feature WHERE {
          ?f a tor:Feature ; rdfs:label ?feature . FILTER(lang(?feature) = "en")
          FILTER NOT EXISTS { ?f tor:shownOn ?p }
        } ORDER BY ?feature""",
    "Match score weights": """
        SELECT ?criterion ?weight WHERE {
          ?c a tor:MatchCriterion ; tor:weight ?weight ; rdfs:label ?criterion . FILTER(lang(?criterion) = "en")
        } ORDER BY DESC(?weight)""",
    "TOR display statuses (Thai labels)": """
        SELECT ?code ?th WHERE {
          ?s a tor:TorDisplayStatus ; tor:code ?code ; rdfs:label ?th . FILTER(lang(?th) = "th")
        }""",
}


def main(path):
    g = Graph()
    g.parse(path, format="xml")
    for title, q in QUERIES.items():
        print(f"\n## {title}")
        for row in g.query(PREFIXES + q):
            print("  " + " | ".join(str(v) for v in row))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "tor-checker.owl")
