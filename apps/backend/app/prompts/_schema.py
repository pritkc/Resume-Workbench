"""Compact resume JSON schema text embedded in parse prompts."""

RESUME_SCHEMA_COMPACT = """{
  "personalInfo":{"name":"...","headline":"...","email":"...","phone":"...","location":"...","website":"...or null","linkedin":"...or null","github":"...or null","photo":"...or null","profileLinks":[{"label":"Portfolio","url":"https://example.com","fontawesome_icon":"link"}],"socialNetworks":[{"network":"LinkedIn","username":"..."}],"customConnections":[{"placeholder":"Portfolio","url":"...or null","fontawesome_icon":"...or null"}]},
  "summary":"string",
  "workExperience":[{"id":1,"position":"...","company":"...","location":"...or null","date":"Jan 2020 - Present","start_date":"2020-01 or null","end_date":"present or 2023-12 or null","summary":"...or null","highlights":["bullet1","bullet2"]}],
  "education":[{"id":1,"institution":"...","area":"...or null","degree":"...or null","location":"...or null","date":"2014 - 2018","start_date":"2014 or null","end_date":"2018 or null","summary":"string or null","highlights":["bullet1"]}],
  "personalProjects":[{"id":1,"name":"...","tech_stacks":"React, TypeScript, AWS or null","date":"Mar 2021 - Present","github":"...or null","website":"...or null","highlights":["bullet1"]}],
  "skills":{"groups":[{"label":"Technical Skills","values":["Python","AWS"]},{"label":"Languages","values":["English (Native)"]}]},
  "customSections":{"publications":{"sectionType":"itemList","items":[{"id":1,"title":"...","subtitle":"...","years":"Jun 2023","description":["..."]}]},"volunteer_work":{"sectionType":"text","text":"..."}}
}"""

RESUME_SCHEMA_EXAMPLE = RESUME_SCHEMA_COMPACT
RESUME_SCHEMA = RESUME_SCHEMA_EXAMPLE
