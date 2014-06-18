---
title: Building locally
subtitle: Staff can run the build locally for development
category: user
---

# Building locally

To write and debug public and hidden test code and `build.xml`, you will want to run the Didit build locally on your machine.

Didit works by copying everying in the assignment's `grading` directory into a clone of the student's submission.
To avoid making copies of the build material for local builds, use [symlinks](http://en.wikipedia.org/wiki/Symbolic_link) instead.

## Copy or link build materials

In the directory with a staff solution or student submission, symlink each of the files or directories from the assignment's `grading` directory in the staff repository.

E.g., in the root of the solution directory:

    ln -s /path/to/staffrepo/spring13/psets/ps0/grading/build.xml
    ln -s /path/to/staffrepo/spring13/psets/ps0/grading/grader-proj
    ...

In this example, `grader-proj` is a directory, and you must *not* have a trailing slash in the `ln -s` command.

On Windows, copy the files intead of symlinking.

If you are working with a solution in the staff repository, take care not to commit these copies or symlinks!

## Run `ant`

In order to run Ant, you must know the path to your installation of Eclipse.
This is the directory that contains the Eclipse executable and subdirs `features` and `plugins`, among others.

+ On Linux, this might be `/usr/lib/eclipse`.
+ On OS X, this might be `/Applications/Eclipse`.

In the solution directory, run Ant with:

    ant -Declipse.home=/path/to/eclipsedir TARGET

`TARGET` is `compile`, `public`, or `hidden` as described in **[build configuration]**.

[build configuration]: build-config.html
