---
layout: post
title:  "LXC with GPU passthrough"
date:   2025-07-19 01:20:35 +0700
categories: infra
---

LXC is a Linux container runtime. Unlike runc (containerd) or CRI-O (k8s), LXC does not follow the OCI specs; and they manages system containers rather than application containers. Since they're lighter than full-fledged VMs, LXC has gained significant interest from homelab enthusiasts looking to maximize hardware performance.

I've been experimenting with LXC recently, and I have to admit - it's an impressive piece of technology. Because LXC containers run directly on the host kernel, they can share hardware resources - especially GPUs - across containers. In contrast, sharing a single GPU across multiple QEMU VMs isn't possible unless the GPU supports SR-IOV or some VFIO technologies that only available to enterprise sector.

Despite their popularity, the documentation is still somewhat lacking. For example, the official tool for building LXC images, [distrobuilder][distrobuilder-docs], doesn’t include any examples of YAML configuration. Fortunately, [this forum discussion][distrobuilder-discuss-01] helped me gain some understanding of how everything works together.

This guide consists of three steps:
1. [Prerequisites](#prerequisites)
2. [Configure and build](#configure-and-build)
3. [GPU passthrough](#gpu-passthrough)

# Prerequisites

Installing distrobuilder on Ubuntu is straightforward:
```bash
snap install distrobuilder --classic
```

For other distributions, follow the full installation guide [here][distrobuilder-github].

Before jumping into the build, you need to choose a base distro for the root filesystem. LinuxContainers maintains [an image server][lxc-images] with archives available for download. Be sure to select the correct release, architecture, and variant; make sure the image supports LXC; and download the rootfs file to your current directory. Alternatively you can use `lxc image` to list and download images directly:
```bash
lxc image list ubuntu: 24.04 architecture=$(uname -m)
lxc image export ubuntu:24.04
```

If you're using Proxmox, you can fetch and download the rootfs archive with `pveam`:
```bash
pveam update
pveam available
pveam download local ubuntu-24.04-standard_24.04-2_amd64.tar.zst
```

# Configure and build

Here is the YAML configuration I used:
```yaml
image:
  distribution: ubuntu
  architecture: amd64
  description: Ubuntu 24.04 with host GPU support
  release: 24.04.2-hostgpu

source:
  downloader: rootfs-http
  url: https://images.linuxcontainers.org/images/ubuntu/noble/amd64/default/20250715_07:42/rootfs.tar.xz

files:
  - generator: dump
    path: /etc/.pve-ignore.resolv.conf
    mode: 644
    uid: 0
    gid: 0

packages:
  manager: apt
  sets:
    - packages:
      - wget
      - openssh-server
      action: install

actions:
  - trigger: post-packages
    action: |-
      #!/bin/bash
      /usr/bin/wget "https://us.download.nvidia.com/XFree86/Linux-x86_64/575.64.03/NVIDIA-Linux-x86_64-575.64.03.run" -O /tmp/nvidia.run
      /usr/bin/sh /tmp/nvidia.run --no-kernel-modules --compat32-libdir /lib32 --no-systemd -s
```

Since you've downloaded the rootfs, you can change the `source.url` attribute to `file://<path to rootfs>`.

The configuration file includes several key fields you may want to check:
- `files`: Used to modify the filesystem. For example, I added `/etc/.pve-ignore.resolv.conf` to prevent Proxmox from overwriting `/etc/resolv.conf`.
- `packages`: Specifies additional packages to install. Other package managers are supported as well, see the [official documentation][distrobuilder-docs-pkg] for details.
- `action`: Defines shell commands to be executed during the build. In my case, I included a script to download and install NVIDIA libraries. Be sure to add `--no-kernel-modules` since kernel modules are managed by the host; and use `--no-systemd` if you encounter systemd-related errors during the build.

To repack the rootfs, you can use the following commands:
```bash
mkdir out
distrobuilder build-lxc <path to yaml> ./out
```

These commands will generate two files in the `out` directory: `meta.tar.gz` and `rootfs.tar.gz`, which can be used to create new containers.

# GPU passthrough

After a container is created, you need to pass the appropriate PCIe devices to it. In my case, for an RTX 5090, the following device files need to be passed:
```
/dev/nvidia0
/dev/nvidiactl
/dev/nvidia-uvm
/dev/nvidia-uvm-tools
```

On the host OS, make sure to load the NVIDIA kernel modules first:
```bash
modprobe nvidia nvidia_uvm
```

If you want to use [Nsight features][nvidia-perf-counter-err], add the following parameter to allow non-root profiling:
```bash
modprobe nvidia NVreg_RestrictProfilingToAdminUsers=0 nvidia_uvm
```

[distrobuilder-docs]: https://linuxcontainers.org/distrobuilder/docs/latest/
[distrobuilder-discuss-01]: https://discuss.linuxcontainers.org/t/solved-best-way-to-repackage-a-running-lxc-container/6452/5
[distrobuilder-github]: https://github.com/lxc/distrobuilder
[lxc-images]: https://images.linuxcontainers.org
[distrobuilder-docs-pkg]: https://linuxcontainers.org/distrobuilder/docs/latest/reference/packages/
[nvidia-perf-counter-err]: https://developer.nvidia.com/nvidia-development-tools-solutions-err_nvgpuctrperm-permission-issue-performance-counters
