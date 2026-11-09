# Scrum Workflow

How the team works. We started from Scrum and adapted it to a team of three. The diagram shows the whole workflow; the sections below explain each part and where it differs from standard Scrum.

![The TOR Checker Scrum workflow](scrum-workflow.png)

[`scrum-workflow.svg`](scrum-workflow.svg) is the vector version.

## Roles

| Scrum role | Who | Notes |
|---|---|---|
| Product Owner | Paranyu | Keeps the backlog and decides what comes first |
| Scrum Master | Paranyu | Holds the same person as the Product Owner, because the team has only three members |
| Dev team | Paranyu, Pakorn, Karnpon | Everyone builds, reviews and tests |

One person holds two roles, so there is no second view on priorities. Reviews of each other's pull requests make up for part of that.

## The sprint cycle

| Scrum element | How we do it | Where to see it |
|---|---|---|
| Product backlog | Every piece of work is a GitHub issue with a problem, a solution, context and a link to the requirement it implements (for example FR-19) | Issues, and the Backlog column of the project board |
| Sprint planning meeting | The team picks issues for the sprint, adds the sprint label and moves them to the Ready column | The `sprint: ...` label on an issue and the Ready (Sprint backlog) column |
| Sprint backlog | The issues in the Ready column | The project board |
| Sprint | Two weeks. The labelled sprints ran 10 Sep to 24 Sep and 25 Sep to 9 Oct | The two `sprint:` labels |
| Daily stand-up | A short check-in every day on what is done, what is next and what blocks | Held by the team, no trace in the repository |
| Sprint review | At the end of the sprint the team shows the finished work | Held by the team, no trace in the repository |
| Finished work | Pull requests merged into `main`, with the card in the Done column | Merged pull requests and the Done column |

The planning, stand-up and review meetings were confirmed by the team. They leave no record in the repository, so this page cannot show their dates or notes.

## One issue, from start to finish

The strip at the bottom of the diagram is what happens inside a sprint for each issue. The rules are in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

1. Take an issue from the Ready column and move it to In Progress.
2. Branch from `main`, named `<type>/<what-you-are-doing>`. Nobody pushes to `main` directly.
3. Commit in small steps. Each commit does one thing and follows Conventional Commits.
4. Open a pull request into `main` on the organization's template, and link the issue.
5. CI runs type checking, tests and the build. It runs on every pull request.
6. A teammate reviews and approves. 87 of the 89 pull requests so far have at least one review.
7. The pull request is merged into `main` and the card moves to Done.

## How we differ from standard Scrum

- **No sprint retrospective.** The team does not hold one, so there is no regular moment to change how we work. This is the biggest gap against Scrum.
- **One person is Product Owner and Scrum Master.** See the roles above.
- **Sprint labels stop after 9 October.** Later issues have none, so the board does not show which sprint they belong to. If the sprints went on, the labels should too.
- **The two-week length is a team choice.** Scrum allows one to four weeks.
- **Reviews are a team rule, not enforced.** GitHub does not block a merge without approval, because `main` has no branch protection.
