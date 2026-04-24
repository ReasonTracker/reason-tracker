# Animations Glossary

This document is a companion to [Video Animation](./Video%20Animation.md) and [Animations Table](./Animations%20Table.md).
It names the shared animation vocabulary used by `GraphView`, `GraphEvents`, `CameraMove`, and `Fade`.

Scope note: this glossary covers the shared graph, camera, and fade animation model.
It does not catalog episode-specific art-direction motion such as brand-sequence choreography.

## Glossary

| Term                           | Kind               | Description                                                                                                                                        |
| ------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| score occurrence               | individual item    | One rendered claim card tied to one `scoreId`; it can move, resize, fade, and update displayed score values over time.                             |
| connector span                 | individual item    | One rendered connector path tied to one layout span visual; its route, widths, and reveal state can animate.                                       |
| confidence source span         | individual item    | The source-side half of a confidence connector; it uses `scaleOfSources` and can animate separately from the delivery side when a junction exists. |
| confidence delivery span       | individual item    | The target-side half of a confidence connector; it uses `deliveryScaleOfSources` and may be held until a later delivery phase.                     |
| relevance span                 | individual item    | A relevance connector span that routes from a source claim to a target confidence connector or its active junction visual.                         |
| connector junction             | individual item    | The tapered box where a relevance connector joins a confidence connector; its center, width, and side heights can animate.                         |
| graph bounds                   | individual item    | The rendered graph width and height stored in each snapshot; they can interpolate when layout size changes.                                        |
| camera move                    | individual item    | The viewport transform that pans and zooms the graph toward a claim target, explicit target box, or reset view.                                    |
| fade                           | individual item    | An opacity-only wrapper animation that fades content in and out over named Remotion sequences.                                                     |
| pipe walls                     | render layer       | The outer connector outline layer rendered for a connector span.                                                                                   |
| pipe interior                  | render layer       | The interior hollow pipe layer rendered inside the connector walls.                                                                                |
| fluid layer                    | render layer       | The filled confidence or relevance layer that can reveal separately from the pipe shell.                                                           |
| wave                           | sequencing term    | The full traversal of one command's effect through the projected score graph.                                                                      |
| step                           | sequencing term    | One frontier advance within a wave; one step may update multiple score occurrences in parallel.                                                    |
| operation group                | sequencing term    | The set of planner operations that `GraphView` treats as one animation unit before segment retiming.                                               |
| transition segment             | sequencing term    | One timed `fromSnapshot` to `toSnapshot` animation slice in `GraphView`.                                                                           |
| structural membership envelope | item group         | The multi-operation add or delete membership group that keeps layout safe before later non-structural phases run.                                  |
| phase                          | sequencing term    | A named sub-part of an animation sequence such as `layout and claim`, `junction shape`, or `junction-to-target delivery`.                          |
| path-relative reveal           | path behavior term | A connector reveal that advances along the routed path from one end instead of appearing across the whole span at once.                            |
| path-relative width sweep      | path behavior term | A width-change animation that moves a transition front along a connector path instead of changing the whole span simultaneously.                   |
| whole-span interpolation       | path behavior term | A width and movement change that applies across the full visible span at the same time.                                                            |
| moving transition front        | path behavior term | The advancing boundary between old and new connector widths inside a path-relative width sweep.                                                    |
| open extremity                 | path behavior term | A moving connector end that stays visually open instead of tapering shut.                                                                          |
| curved transition front        | path behavior term | The curved boundary used while connector width or fluid offsets transition along a path.                                                           |
| active junction visual         | path behavior term | The currently rendered junction geometry used to keep targeting relevance endpoints locked to the visible junction box.                            |

## Term Notes

| Term                         | Meaning In This Repo                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| wave                         | One command's full effect as it traverses the projected score graph.                                                    |
| step                         | One frontier advance inside a wave, usually emitted as one `ScoreUpdated` operation.                                    |
| grow along the path          | A path-relative reveal where the visible connector extends from one end toward the other.                               |
| sweep along the path         | A path-relative width change where a moving transition front travels along the connector route.                         |
| all at once along the length | Whole-span interpolation where width and movement change together across the full visible span in the same frame range. |
