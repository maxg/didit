# Builds and sweeps

## Builds

Didit uses a hook script in student repos to trigger a build every time a student pushes new commits to their assignment repo:

0. The web front-end queues the build and maintains an open connection to the requester.
   Progress is reported over that connection, and Git echos the output back to the original `git push` command so students receive feedback right in their terminal.

0. A worker picks up the build...

   0. clones the relevant revision of the student repository into a temporary directory
   
   0. exports current build materials from the staff repository into that same directory
   
   0. runs Ant with the `compile`, `public`, and `hidden` targets defined in [**`build.xml`**][build configuration]
   
   0. uses [**`grade.csv`**][grade assignment] to grade the test results
   
   0. stores the results in the filesystem

0. The web front-end finishes reporting build results back to the student's terminal, or times out with a link to the results page.

0. For multi-person repositories, the front-end sends a build notification email.

<div class="thumbnail pull-right">
<a class="btn btn-xs btn-default">build</a>
</div>

In unusual circumstances, staff can request a build for a student's current revision on their assignment page with the ***build*** button.

<div class="thumbnail pull-right">
<a class="btn btn-xs btn-default">rebuild</a>
</div>

In very unusual circumstances, staff can force a ***rebuild*** of a student revision on the build result page for that revision.
Note that this *discards* existing build results if the build revision is the same!
If you are trying to debug a problem with the build, you will be sad.

[build configuration]: build-config.html
[grade assignment]: grade-assignment.html

## Sweeps

Sweeps ensure that deadlines and grading are consistent.
When the system performs a sweep, it iterates over all the student repositories for an assignment and records the current revision in each repository.
It then ensures that those revisions have all been built and graded with the latest version of the build materials for that assignment, triggering builds as necessary.

<div class="thumbnail pull-right">
<a class="btn btn-sm btn-info">New sweep</a>
</div>

On an assignment page, use ***new sweep*** to schedule a sweep.

+ For dates in the past, the system will immediately sweep student repos for their latest commits as of that date.
  Note that since students could re-write their commit history, sweeping past dates gives unscrupulous students a window to cheat.

+ For dates in the future, the system will wait until the appointed time and then perform the sweep immediately.
  
Schedule sweeps in advance so they run at the deadline time to avoid the possibility of cheating.

## Catch-ups

Since Didit builds submissions continuously, there should be very little work to do when the system performs a sweep.
However, a sweep always demands that student repos have been built with the *current* builder.
If the build materials are modified close to the assignment deadline, the sweep will trigger a large amount of work.

<div class="thumbnail pull-right">
<a class="btn btn-sm btn-default">Catch-up</a>
</div>

To avoid this problem, use ***catch-up*** on the assignment page to lazily build all student repos with the current builder over the course of hours or days.

A catch-up is also useful for triggering builds of repos that belong to staff or students who have not pushed any work.
