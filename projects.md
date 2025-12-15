---
layout: page
title: Projects
permalink: /projects/
---

I have worked on a number of projects, and here is an incomplete list.

### VNOJ

[VNOJ](https://oj.vnoi.info) is a modern, open-source online judge, forked from DMOJ. As a senior contributor, my work has included:

- Contributing to 21+ pull requests for both backend and frontend components.
- Identifying 3 critical security issues within the backend and the judge system.

I also maintain a private fork named [HNOJ](https://hnoj.edu.vn) serving high school students in Hanoi. This version incorporates several additional features and fixes such as:

- Implementing the use of S3 presigned URLs to handle large file submissions.
- Containerizing all services and using Terraform to provision and automatically deploy them to AWS ECS.

### Open Source Work

I contributed to the development of a Windows port for pwndbg, a popular GDB plug-in for exploit development and reverse engineering. A detailed account of this work can be found in my blog post [here]({% link _posts/2025-09-01-dbgeng-and-pwndbg.md %}).

Additionally, I have contributed bug fixes to a variety of other open-source projects, including:

- Python (CPython).
- Shadow (a discrete-event network simulator).
- js-libp2p (a networking stack for P2P applications, used by IPFS).
- pwndbg (GDB plug-in for exploit development).


### Smaller Projects

<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js" integrity="sha512-v2CJ7UaYy4JwqLDIrZUI/4hqeoQieOmAZNXBeQyjo21dadnwR+8ZaIJVT8EE2iyI61OV8e6M8PP2/4hpQINQ/g==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/featherlight/1.7.13/featherlight.min.js" integrity="sha512-0UbR6HN0dY8fWN9T7fF658896tsPgnbRREHCNq46J9/JSn8GonXDZmqtTc3qS879GM0zV49b9LPhdc/maKP8Kg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/featherlight/1.7.13/featherlight.min.css" integrity="sha512-56GJrpSgHk6Mc9Fltt+bQKcICJoEpxtvozXPA5n5OT0rfWiqGlJmJCI/vl16kctf/0XbBloh03vl7OF2xFnR8g==" crossorigin="anonymous" referrerpolicy="no-referrer" />
<link rel="stylesheet" href="{{ '/assets/css/projects.css' | relative_url }}">
<script src="{{ '/assets/js/projects.js' | relative_url }}"></script>
<div class="project-container">
{% for project in site.data.projects %}
    <div class="project" id="project-{{ project.id }}">
        {% assign formatted_description = project.description | markdownify %}
        {% if formatted_description contains "</a>" %}
            {% assign contain_link = true %}
        {% else %}
            {% assign contain_link = false %}
        {% endif %}
        <a href="{{ project.url }}" target="_blank">
            <div class="project-preview">
                <img src="{{ project.image }}" alt="{{ project.title }} preview">
            </div>
            <div class="project-title">{{ project.title }}</div>
            {% unless contain_link %}
            <div class="project-description">
                {{ formatted_description }}
            </div>
            {% endunless %}
        </a>
        {% if contain_link %}
        <div class="project-description pd-nested-link">
            <a class="overlay" href="{{ project.url }}" target="_blank"></a>
            <div class="inner">
                {{ formatted_description }}
            </div>
        </div>
        {% endif %}
        <div class="project-extra">
            {{ project.extra | markdownify }}
        </div>
    </div>
{% endfor %}
</div>
<div class="project-showcase" style="display: none">
    <div class="showcase-preview"></div>
    <div class="showcase-title"></div>
    <div class="showcase-body"></div>
    <div class="showcase-extra"></div>
</div>
