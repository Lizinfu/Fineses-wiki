---
title: "{{ replace .Name "-" " " | title }}"
description: ""
date: "{{ .Date }}"
lastmod: "{{ .Date }}"
draft: true

params:
  id: "evt.replace-this-id"
  schema: "event.v1"
  entity_kind: "event"
  canon_status: "canon"

  library:
    catalog_no: ""
    access_level: "public"
    reliability: "verified"
    last_reviewed: ""
    source_refs: []

  timeline:
    include: true
    calendar: "default"
    categories:
      - "other"
    status: "verified"

    start:
      display: "替换为世界内显示日期"
      sort_value: 0
      precision: "year"
      circa: false

    # 时间范围记录可以取消以下注释：
    # end:
    #   display: "结束日期"
    #   sort_value: 0
    #   precision: "year"

    source_refs: []
    summary: ""
---
