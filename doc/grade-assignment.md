# Grade assignment

Didit computes a grade based on the results of public and hidden tests every time it builds a student submission.

**Sweeps** ensure consistent grading at a deadline, as descibed in **[builds and sweeps]**.

**Milestones** allow for multiple deadlines per assignment, and they enable special-case grade assignment for individual students.
Grades are only released to students after they are associated with a milestone.

[builds and sweeps]: builds-and-sweeps.html#sweeps

## Grade sheet: `grade.csv`

Both public and hidden tests can be associated with point values specified by `grade.csv`, which must be in [CSV](http://en.wikipedia.org/wiki/Comma-separated_values) format in the `grading` directory for an assignment.

The first column of each line in `grade.csv` specifies the test type.
`junit` is the only supported type.
Leave this column blank to include comments, e.g.:

    ,PS0 Didit gradesheet
    ,,,Total points,20

For `junit` tests, the remaining columns are: package, class, test method, and points:

    junit,grader,AssignmentTest,testOne,5
    junit,grader,AssignmentTest,testTwo,15

This specifies two test methods in `grader.AssignmentTest`, `testOne` worth 5 points and `testTwo` worth 15.

## Assigning grades by sweep

<div class="thumbnail pull-right">
<a class="btn btn-default">assign grades by sweep</a>
</div>

On the milestone page, use ***assign grades by sweep*** to select a sweep and provide a list of usernames.
Those users will be assigned milestone revisions and grades according to the revisions recorded in that sweep.

## Assigning grades by revision

<div class="thumbnail pull-right">
<a class="btn btn-default">assign grades by revision</a>
</div>

On the milestone page, use ***assign grades by revision*** to find one or more users and provide revisions that should be used for their grades on the milestone.

Use your browser's search feature to locate the user(s) you want.

If a grade is assigned in error, and you cannot re-assign a correct grade yet, you can un-assign the grade by going to the *build results* directory and removing the milestone's copy of the grade.
Under build results: `milestones/SEMESTER/KIND/PROJ/MILESTONE/USERNAME.json`

## Releasing grades

<div class="thumbnail pull-right">
<a class="btn btn-default">release grades</a>
</div>

Grade reports for a milestone are not accessible to students until they are released.

If milestone grades are released in error, you can un-release them by going to the *build results* directory and removing the `released` file for that milestone.
Under build results: `milestones/SEMESTER/KIND/PROJ/MILESTONE/released`
