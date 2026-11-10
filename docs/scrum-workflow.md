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
| Sprint planning meeting | The team picks issues for the sprint, sets the Sprint field and moves them to the Ready column | The Sprint field and the Ready (Sprint backlog) column of the board |
| Sprint backlog | The issues in the Ready column | The project board |
| Sprint | 15 days. Six sprints, from 11 August to 8 November | The Sprint field of the board |
| Stand-up | A short check-in on what is done, what is next and what blocks, every Monday, Wednesday and Friday | Held by the team, no trace in the repository |
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

- **The retrospective is not regular.** A retrospective meeting was held for Sprint 5, with action items. For the other sprints the reflections in [`docs/process/retrospectives.md`](process/retrospectives.md) were written from the board and the git history. Holding one at the end of every sprint is the biggest gap against Scrum.
- **One person is Product Owner and Scrum Master.** See the roles above.
- **Some board items have no sprint.** 17 of the 98 items have no value in the Sprint field.
- **The stand-up is three times a week, not daily.** Scrum asks for a daily one. On the days without a stand-up, someone who is blocked has to wait or ask in the chat.
- **The 15-day length is a team choice.** Scrum allows one to four weeks.
- **Reviews are a team rule, not enforced.** GitHub does not block a merge without approval, because `main` has no branch protection.
