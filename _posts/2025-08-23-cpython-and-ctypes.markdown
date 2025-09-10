---
layout: post
title:  "A 20-year-old bug in Python’s ctypes"
date:   2025-08-23 01:03:35 +0700
categories: debugging
---

> **UPDATE (2025 Sep 10)**: [The PR#138285](https://github.com/python/cpython/pull/138285) fixing this bug has been merged into main and will be backported to other Python versions.

Recently, while tinkering with the [comtypes](https://github.com/enthought/comtypes) library, I stumbled upon a mysterious SIGSEGV. At first, I assumed the crash originated within the library itself, so I dug into its source code. To my surprise, comtypes doesn’t even include any C code in its implementation!

The real culprit turned out to be the C implementation of ctypes-and it’s a classic time-of-check to time-of-use (TOCTOU) bug. I filed an [issue](https://github.com/python/cpython/issues/138008) on the CPython GitHub repository. In short, the problem is tied to a parameter named `paramflags`, which is used when constructing functions to support Python’s named arguments. The catch? Variadic functions break because argtypes gets fixed too early during prototype construction.

This bug has been around for over 20 years, dating all the way back to the [very first commit](https://github.com/python/cpython/blob/d4c9320412177895f598a93d73a0e654db27c351/Modules/_ctypes/_ctypes.c) of ctypes. Given its widespread use, it’s surprising that such an issue has gone unnoticed for so long.
