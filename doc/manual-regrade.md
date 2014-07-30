---
title: Manual regrading
subtitle: Break glass in case of emergency
category: user
---

# Manual regrading

Unfortunately, you may need to grade a student's submission using a modified version of the staff tests.
Fortunately, this has only been necessary once or twice per semester since Didit was introduced to 6.005.

**Avoid having to do manual regrading:** review and correct issues with the public and hidden tests while students are working, before the assignment deadline.

In order to follow this procedure, you must have Didit running locally in your development environment.

0.  Use `ant`, as described in **[building locally]**, with the `public` target to obtain `TESTS-TestSuites.xml`.

0.  Run `node ant path/to/TESTS-TestSuites.xml path/to/public.json` to generate `public.json`.

0.  Run `ant` with the `hidden` target.

0.  And run `node ant` again to generate `hidden.json`.

0.  Now use `node grader` to grade the results.

        node grader SPEC GRADING-DIR path/to/public.json path/to/hidden.json /path/to/grade

    In this command:

    + `SPEC` is a JSON string of the form: `'{ "kind" : "psets", "proj" : "ps0", "users" : [ "maxg"], "rev" : "abcd123" }'`

    + `GRADING-DIR` is the directory containing `grade.csv` for this project

    + output will be in the file `path/to/grade.json`
    
    E.g., copy `grade.csv` and the test result `.json` files to `tmp`:
    
        node grader '{ ... }' tmp tmp/public.json tmp/hidden.json tmp/grade

0.  Copy `grade.json` to the Didit result directory for the appropriate build and current staff revision, replacing the existing `grade.json`.
    Note that this *only* updates the grading results, it does not update the public or hidden test views.

0.  Update the milestone grade by **[assigning a grade by revision]** with the same revision, since the milestone stores a copy of the grade and will *not* update automatically.

[building locally]: building-locally.html
[assigning a grade by revision]: grade-assignment.html#assigning-grades-by-revision
