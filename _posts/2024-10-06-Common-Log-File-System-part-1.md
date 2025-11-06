---
layout: post
title:  "Common Log File System (Part 1)"
date:   2024-10-06 01:04:21 +0700
categories: security
---

Common Log File System (CLFS) is a general-purpose logging service that is accessible to both kernel-mode and user-mode programs [[4]](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/introduction-to-the-common-log-file-system). The service offers a public user-mode API for any programs want to store log records on the file system. CLFS is designed to run in kernel to enhance its resilience against system failures. However, due to the complex structure of the log format (BLF), CLFS has made itself a huge attack vector, with 24 CVEs reported in the past 5 years [[5]](https://techcommunity.microsoft.com/t5/security-compliance-and-identity/security-mitigation-for-the-common-log-filesystem-clfs/ba-p/4224041).

CLFS uses the “Base Log File” (BLF) format to maintain necessary metadata for the log and uses container files to hold the actual records. The format of BLF is largely undocumented; however, efforts by Alex Ionescu [[6]](https://github.com/ionescu007/clfs-docs) have made the reverse engineering process significantly easier.

# General knowledge

A BLF file consists of six metadata blocks: Control Block, Base Block, Truncate Block, and their corresponding shadow blocks. Shadow blocks contain copies of the metadata, which can be used for data consistency. Every block starts with a 70-byte log block header, called `CLFS_LOG_BLOCK_HEADER`, followed by their records.

![](/assets/img/a0ee2034f286e448787e5609b0f79ac0f0ac05fab308d9ce0f49489b776aa508.svg)
*Base Log File format*

The blocks are stored in sectors, each of which is 512 bytes in size. At the end of every sector will be a signature, which is composed of two bytes: the sector block type and the update sequence number (USN). The signatures are used for data consistency.
The value of `RecordOffsets[0]` in a `CLFS_LOG_BLOCK_HEADER` is the offset to its record.

## Control Record
The control record follows the log block header of the control block, which is defined by the following structure:

```c
typedef struct _CLFS_CONTROL_RECORD
{
    CLFS_METADATA_RECORD_HEADER hdrControlRecord;
    ULONGLONG ullMagicValue;
    UCHAR Version;
    CLFS_EXTEND_STATE eExtendState;
    USHORT iExtendBlock;
    USHORT iFlushBlock;
    ULONG cNewBlockSectors;
    ULONG cExtendStartSectors;
    ULONG cExtendSectors;
    CLFS_TRUNCATE_CONTEXT cxTruncate;
    USHORT cBlocks;
    ULONG cReserved;
    CLFS_METADATA_BLOCK rgBlocks[ANYSIZE_ARRAY];
} CLFS_CONTROL_RECORD, *PCLFS_CONTROL_RECORD;
```

## Base Record
The base record contains information about the clients and containers associated with the log file.

```c
typedef struct _CLFS_BASE_RECORD_HEADER
{
    CLFS_METADATA_RECORD_HEADER hdrBaseRecord;
    CLFS_LOG_ID cidLog;
    ULONGLONG rgClientSymTbl[CLIENT_SYMTBL_SIZE];
    ULONGLONG rgContainerSymTbl[CONTAINER_SYMTBL_SIZE];
    ULONGLONG rgSecuritySymTbl[SHARED_SECURITY_SYMTBL_SIZE];
    ULONG cNextContainer;
    CLFS_CLIENT_ID cNextClient;
    ULONG cFreeContainers;
    ULONG cActiveContainers;
    ULONG cbFreeContainers;
    ULONG cbBusyContainers;
    ULONG rgClients[MAX_CLIENTS_DEFAULT];
    ULONG rgContainers[MAX_CONTAINERS_DEFAULT];
    ULONG cbSymbolZone;
    ULONG cbSector;
    USHORT bUnused;
    CLFS_LOG_STATE eLogState;
    UCHAR cUsn;
    UCHAR cClients;
} CLFS_BASE_RECORD_HEADER, *PCLFS_BASE_RECORD_HEADER;
```

## Common Log File System API
Clfsw32 (the user-space library for CLFS) provides 43 functions, of which only 3 are used in the PoC:
-	`CreateLogFile`: create/open log file.
-	`DeleteLogByHandle`: delete log file by handle.
-	`AddLogContainer`: add a container to the log handle.

The following diagram describes the trace from user-mode `CreateLogFile` API to kernel-mode CLFS driver. The call stack was extracted using WinDBG.

![](/assets/img/e84e3f8437055cf0e6839312169f771c2a5c402b8833d34e4977d3ffe982ec4e.svg)
*Call stack of `CreateLogFile`*

# Exploit targets

## RemoveContainer's double vtable calls
There is an interesting call stack during the call to `DeleteLogByHandle` and `CloseHandle`:

![](/assets/img/98d33a6453bc15b3fe65f0e13153fd7f28b6b2763f101d1bb0136bab956a373e.svg)

```c
__int64 __fastcall CClfsBaseFilePersisted::RemoveContainer(CClfsBaseFilePersisted *this, unsigned int a2)
{
  ...
  Symbol = CClfsBaseFile::GetSymbol(&this->m_ClfsBaseFile, v8, v2, &v17);
  v10 = v17;
  ...
  pContainer = v10->pContainer;
  if ( pContainer )
  {
    v10->ullAlignment = 0i64;
    ExReleaseResourceForThreadLite(this->m_ClfsBaseFile.ImageResource, (ERESOURCE_THREAD)KeGetCurrentThread());
    v4 = 0;
    (*((void (__fastcall **)(CClfsContainer *))pContainer->vftable + 3))(pContainer);
    (*((void (__fastcall **)(CClfsContainer *))pContainer->vftable + 1))(pContainer);
    v7 = v16;
    goto LABEL_20;
  }
  ...
}
```
*Pseudocode of CClfsBaseFilePersisted::RemoveContainer*

The function `CClfsBaseFilePersisted::RemoveContainer` makes two vtable calls using the `pContainer` field of the container context. Therefore we will get two RIP controls if we are able to corrupt the `pContainer` field.

These two calls are handy when we want to disable SMEP: the first call flip the 20-th bit of CR4; the second call enables arbitrary code execution. Note that due to PatchGuard, the shellcode should restore the CR4 register (with a gadget) before jumping back to kernel.

### CVE-2022-24521
During the encoding stage (`ClfsEncodeBlock`), the signature bytes (the last 2 bytes in each sectors) are copied into an array pointed by `SignaturesOffset` header field. While decoding (`ClfsDecodeBlock`), the array bytes are written back into their respective sectors. Therefore all modified data in that array is restored after two stages of decoding and encoding.

In the following function (`CClfsBaseFilePersisted::WriteMetadataBlock`), the base block is encoded in stage 1 (the signature bytes are moved back into the signature array). The array pointed by SignaturesOffset field was forged such that its address lies close to `CLFS_CONTAINER_CONTEXT` structure, therefore the `context->pContainer` pointer is restored (to our crafted address) after the encoding stage.

```c
...
    for ( i = 0; i < 0x400; ++i ) // Obtain all container contexts represented in blf
                                  // Save pContainer class pointer for each valid container context
    {
      v20 = CClfsBaseFile::AcquireContainerContext(&this->m_ClfsBaseFile, i, &context);
      v15 = &this->m_ClfsBaseFile.vftable + i;
      if ( v20 >= 0 )
      {
        v16 = context;
        v15[0x38] = context->pContainer;    // 0x38=offset rgContainerClassPointers
                                            // For each valid container save pContainer
        v16->pContainer = 0i64;             // And set the initial pContainer to zero
        CClfsBaseFile::ReleaseContainerContext(&this->m_ClfsBaseFile, &context);
      }
      else
      {
        v15[0x38] = 0i64;
      }
    }
    // Stage [1] Encode block, prepare it for writing
    ClfsEncodeBlock(pbImage, pbImage->TotalSectorCount << 9, pbImage->Usn, 0x10u, 1u);
    v10 = CClfsContainer::WriteSector(          // Write modified data
            this->field_98_CClfsContainer,
            this->ReadEvent,
            0i64,
            this->m_ClfsBaseFile.rgBaseBlocks[v8].pbImage,
            pbImage->TotalSectorCount,
            (union _LARGE_INTEGER *)v21);
    ...
```

### CVE-2022-24481
During the internal initialization of `CClfsLogFcbPhysical` (the `CClfsLogFcbPhysical::Initialize` function used to read image), the field offset `1A8h` is assigned with `clientContext->llCreateTime`.

```c

  ...
    v35 = clientContext;
    this->field_1A8 = clientContext->llCreateTime.QuadPart;
    this->field_1B0 = v35->llAccessTime.QuadPart;
    this->field_1B8 = v35->llWriteTime.QuadPart;
    this->field_1D0 = 0i64;
    *(_QWORD *)&this->field_538 = v35->lsnOwnerPage.Internal;
    this->field_1E8.Internal = v35->lsnArchiveTail.Internal;
    this->field_1E0.Internal = v35->lsnBase.Internal;
    this->field_1F0.Internal = v35->lsnLast.Internal;
    this->field_1F8.Internal = v35->lsnRestart.Internal;
    *(_DWORD *)&this->gap171[3] = v35->cShadowSectors;
    eState = v34->eState;
  ...
```

When the file is being closed, the driver calls `CClfsLogFcbPhysical::FlushMetadata` to flush the internal data. During the process, `clientContext->llCreateTime` is restored back its initial value, which mean it's possible to forge this structure so that the field overlaps with some pointers. In this exploit we forged the BLF image so that `clientContext->llCreateTime` overlaps with `containerContext->pContainer`.
```c
...
  clientContext = 0i64;
  v2 = CClfsBaseFile::AcquireClientContext(&this->field_2B0_CClfsBaseFilePersisted->m_ClfsBaseFile, 0, &clientContext);
  if ( v2 >= 0 && (v3 = clientContext) != 0i64 )
  {
    eState = clientContext->eState;
    v5 = this->flags;
    clientContext->llCreateTime.QuadPart = this->field_1A8;//restore
    v3->llAccessTime.QuadPart = this->field_1B0;
    v3->llWriteTime.QuadPart = this->field_1B8;
    v3->lsnOwnerPage.Internal = *(_QWORD *)&this->field_538;
    v3->lsnArchiveTail.Internal = this->field_1E8.Internal;
    v3->lsnBase.Internal = this->field_1E0.Internal;
    v3->lsnLast.Internal = this->field_1F0.Internal;
...
```

### CVE-2023-28252
During the decoding step, `ClfsDecodeBlockPrivate` doesn't verify the `ValidSectorCount` field, although `ClfsEncodeBlockPrivate` does.

The function `ClfsEncodeBlock` invalidates the block by zeroing the checksum when `ClfsEncodeBlockPrivate` returns negative.

```c
__int64 __fastcall ClfsEncodeBlock(
        struct _CLFS_LOG_BLOCK_HEADER *a1,
        unsigned int a2,
        UCHAR a3,
        unsigned __int8 a4,
        unsigned __int8 a5)
{
  int v7; // edi

  a1->Checksum = 0; // zeros the checksum
  v7 = ClfsEncodeBlockPrivate(a1, a2, a3, a4);
  if ( v7 >= 0 && a5 )
    a1->Checksum = CCrc32::ComputeCrc32(&a1->MajorVersion, a2);
  return (unsigned int)v7;
}
```

In conclusion, it is clear that the driver accepts the log block during its decoding step, and corrupts it in encoding phase. The following snippet sketchs the flow of `CClfsBasePersisted::ReadMetadataBlock`:

```c
__int64 __fastcall CClfsBaseFilePersisted::ReadMetadataBlock(...)
{
  block_shadow = block + 1;
  result1 = ClfsDecodeBlock(block);
  result2 = ClfsDecodeBlock(block_shadow);
  if (!SUCCEEDED(result1)) {
    if (SUCCEEDED(result2)) {
      // use shadow block
    } else {
      // fail
    }
  } else {
    if (SUCCEEDED(result2)) {
      // compare the DumpCount field
      if (CClfsBaseFile::IsYoungerBlock(block, block_shadow)) {
        // use block
      } else {
        // use shadow block
      }
    } else {
      // use block
    }
  }
}
```

The program reads, decodes the block and shadow block from the disk, and compares their `DumpCount`; if one of them is corrupted, the function uses the remaining block. But there's a catch: the program doesn't always re-verify the fields after an invocation to `CClfsBaseFilePersisted::ReadMetadataBlock`! In fact, the driver only does that in `CClfsBaseFilePersisted::OpenImage`, but not in `CClfsBaseFilePersisted::ExtendMetadataBlock`:

```c
__int64 __fastcall CClfsBaseFilePersisted::ExtendMetadataBlock(...)
{
  ...
    for ( i = v3; i < this->m_ClfsBaseFile.BlockCount; i += 2 )
    {
      EventObject = CClfsBaseFile::AcquireMetadataBlock(&this->m_ClfsBaseFile, i);// call ReadMetadataBlock
      k = EventObject;
      if ( EventObject < 0 )
        goto LABEL_50;
    }
    EventObject = CClfsBaseFile::GetControlRecord(&this->m_ClfsBaseFile, &v34);
    k = EventObject;
    if ( EventObject >= 0 )
    {
      ...
      for ( j = 0; ; ++j )
      {
        v35 = j;
        if ( j >= this->m_ClfsBaseFile.BlockCount )
          break;
        EventObject = CClfsBaseFilePersisted::WriteMetadataBlock(this, j, 0); // corrupt the CheckSum
        k = EventObject;
        if ( EventObject < 0 )
          goto LABEL_50;
      }
      ...
      // subsequence calls to ExtendMetadataBlock uses modified iFlushBlock field
      ...
      CClfsBaseFilePersisted::WriteMetadataBlock(this, (unsigned __int16)iFlushBlock, 0); // trigger the exploit
      ...
}
```

In conclusion, the whole trigger process could be summarized into 6 steps:
- When opening the `trigger.blf` file, `ExtendMetadataBlock` is invoked, subsequently calls `ReadMetadataBlock`.
- `ReadMetadataBlock` compares the DumpCount of the control and control shadow blocks, and select the control block.
- `ExtendMetadataBlock` runs `WriteMetadataBlock`, subsequently calls `ClfsEncodeBlock` and corrupts the checksum field and writes the changes to the disk.
- When adding a new container, `ExtendMetadataBlock` is called again 
- This time, `ReadMetadataBlock` uses the control shadow block (since the control block was corrupted).
- `ExtendMetadataBlock` invokes `WriteMetadataBlock` with malicious `iFlushBlock` field from control shadow block.
The function `WriteMetadataBlock` reads the malicious `CLFS_LOG_BLOCK_HEADER` from an overflowed array index.

```c
__int64 __fastcall CClfsBaseFilePersisted::WriteMetadataBlock(CClfsBaseFilePersisted *this, unsigned int a2, char a3)
{
  v4 = a2;
  ...
  v8 = (unsigned int)v4;
  pbImage = (struct _CLFS_LOG_BLOCK_HEADER *)this->m_ClfsBaseFile.rgBaseBlocks[v4].pbImage;// overflow
  p_MajorVersion = (unsigned int *)&pbImage->MajorVersion;
  if ( pbImage )
  {
    v7 = 1;
    v11 = pbImage->RecordOffsets[0];            // corrupted?
    v12 = ++*(_QWORD *)(&pbImage->MajorVersion + v11) & 1i64;
    ...
```

`rgBaseBlocks` is an array of six `CLFS_METADATA_BLOCK` structures that reside in the NonPaged Pool. Suppose that we could control the heap chunk behind that, this function eventually allows arbitrary increment.
The problem comes down to where we should point `pbImage`. Fortunately, since blocks are allocated in Paged Pool whose address can be leaked via `NtQuerySystemInformation`, we can forge the control block and the pbImage field to corrupt `rgContainers[0]`.
Using `CreatePipe` is a common method to allocate memory on the kernel heap [[10]](https://www.sstic.org/media/SSTIC2020/SSTIC-actes/pool_overflow_exploitation_since_windows_10_19h1/SSTIC2020-Article-pool_overflow_exploitation_since_windows_10_19h1-bayet_fariello.pdf). In fact, to reliably control the overflowed data, we must spray the kernel heap and create holes for the victim chunk using `CloseHandle`.

![](/assets/img/f43b3a957892b267a0a4c45807d9eead4d2919a22edcf9a2d5403cbcb4dacbcd.svg)
