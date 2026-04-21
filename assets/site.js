const state = {
  items: [],
  filteredItems: [],
};

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const provinceFilter = document.getElementById("provinceFilter");
const regionFilter = document.getElementById("regionFilter");
const resultMeta = document.getElementById("resultMeta");
const updateTime = document.getElementById("updateTime");
const resultsList = document.getElementById("resultsList");
const emptyState = document.getElementById("emptyState");
const template = document.getElementById("announcementRowTemplate");

function normalizeKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

function getItemHospitalName(item) {
  return item.hospital_name || item.source_name || "医院名称待补充";
}

function getItemSourceTitle(item) {
  return item.source_title || item.title || "公告标题待补充";
}

function getItemPublishDate(item) {
  return item.publish_date || item.publish_time || "";
}

function getItemDeadline(item) {
  return String(item.deadline || "").trim();
}

function getItemApplyUrl(item) {
  return item.apply_url || item.url || "";
}

function getItemJobs(item) {
  return Array.isArray(item.jobs) ? item.jobs : [];
}

function getItemJobCount(item) {
  if (item.job_count !== undefined && item.job_count !== null && item.job_count !== "") {
    return Number(item.job_count) || 0;
  }
  return getItemJobs(item).length;
}

function getItemProvince(item) {
  return String(item.province || "").trim();
}

function getItemRegion(item) {
  const directRegion = String(item.region || "").trim();
  if (directRegion) {
    return directRegion;
  }
  return String(item.district || item.city || item.region_raw || "").trim();
}

function getHospitalMeta(item) {
  const values = [getItemProvince(item), getItemRegion(item)].filter(Boolean);
  return [...new Set(values)].join(" / ");
}

function buildSearchText(item) {
  const jobSearchText = getItemJobs(item).flatMap((job) => [
    job.title || job.name || "",
    job.job_family || "",
    job.headcount || "",
    job.education_requirement || "",
    job.major_requirement || "",
    job.other_conditions || "",
  ]);
  return [
    getItemHospitalName(item),
    getItemSourceTitle(item),
    getItemProvince(item),
    getItemRegion(item),
    item.source_name || "",
    item.title || "",
    getItemApplyUrl(item),
    ...jobSearchText,
  ]
    .join(" ")
    .toLowerCase();
}

function updateSummary(items) {
  const totalJobs = items.reduce((sum, item) => sum + getItemJobCount(item), 0);
  resultMeta.textContent = `共 ${items.length} 条公告，${totalJobs} 个岗位`;
}

function populateSelect(select, options, defaultLabel) {
  const selectedValue = select.value;
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  fragment.appendChild(defaultOption);

  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    fragment.appendChild(option);
  });

  select.replaceChildren(fragment);
  if (selectedValue && options.includes(selectedValue)) {
    select.value = selectedValue;
  } else {
    select.value = "";
  }
}

function getProvinceOptions(items) {
  return [...new Set(items.map((item) => getItemProvince(item)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}

function getRegionOptions(items, province) {
  const matched = province
    ? items.filter((item) => getItemProvince(item) === province)
    : items;
  return [...new Set(matched.map((item) => getItemRegion(item)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}

function refreshFilters() {
  populateSelect(provinceFilter, getProvinceOptions(state.items), "全部省份/直辖市");
  populateSelect(
    regionFilter,
    getRegionOptions(state.items, provinceFilter.value),
    "全部地区",
  );
}

function createJobList(item, detail) {
  const list = detail.querySelector(".job-list");
  list.replaceChildren();

  const jobs = getItemJobs(item);
  if (!jobs.length) {
    const li = document.createElement("li");
    li.className = "job-row";
    const name = document.createElement("p");
    name.className = "job-name";
    name.textContent = "暂无岗位明细";
    const meta = document.createElement("div");
    meta.className = "job-meta";
    const familyChip = document.createElement("span");
    familyChip.className = "job-chip";
    familyChip.textContent = "岗位大类：待补充";
    const countChip = document.createElement("span");
    countChip.className = "job-chip";
    countChip.textContent = "招聘人数：待补充";
    meta.append(familyChip, countChip);
    li.append(name, meta);
    list.appendChild(li);
    return;
  }

  jobs.forEach((job) => {
    const li = document.createElement("li");
    li.className = "job-row";
    const name = document.createElement("p");
    name.className = "job-name";
    name.textContent = job.title || job.name || "岗位名称待补充";
    const meta = document.createElement("div");
    meta.className = "job-meta";
    const familyChip = document.createElement("span");
    familyChip.className = "job-chip";
    familyChip.textContent = `岗位大类：${job.job_family || "待补充"}`;
    const countChip = document.createElement("span");
    countChip.className = "job-chip";
    countChip.textContent = `招聘人数：${job.headcount || "待补充"}`;
    meta.append(familyChip, countChip);
    li.append(name, meta);
    list.appendChild(li);
  });
}

function configureApplyLink(item, fragment) {
  const link = fragment.querySelector(".apply-link");
  const note = fragment.querySelector(".missing-link-note");
  const applyUrl = getItemApplyUrl(item);
  if (applyUrl) {
    link.href = applyUrl;
    link.textContent = "点我报名";
    link.classList.remove("is-disabled");
    link.removeAttribute("aria-disabled");
    link.removeAttribute("tabindex");
    note.hidden = true;
    return;
  }

  link.removeAttribute("href");
  link.textContent = "报名链接缺失";
  link.classList.add("is-disabled");
  link.setAttribute("aria-disabled", "true");
  link.setAttribute("tabindex", "-1");
  note.hidden = false;
}

function setExpanded(row, detail, expanded) {
  row.setAttribute("aria-expanded", String(expanded));
  detail.hidden = !expanded;
  row.classList.toggle("is-expanded", expanded);
}

function configureRowToggle(fragment) {
  const row = fragment.querySelector(".sheet-row");
  const detail = fragment.querySelector(".row-detail");

  function toggleRow() {
    const isExpanded = row.getAttribute("aria-expanded") === "true";
    setExpanded(row, detail, !isExpanded);
  }

  row.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest(".apply-link")) {
      return;
    }
    toggleRow();
  });

  row.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    toggleRow();
  });
}

function render(items) {
  resultsList.replaceChildren();
  updateSummary(items);

  if (!items.length) {
    emptyState.hidden = false;
    resultMeta.textContent = "没有找到匹配的招聘公告。";
    return;
  }

  emptyState.hidden = true;

  items.forEach((item) => {
    const fragment = template.content.cloneNode(true);
    const detail = fragment.querySelector(".row-detail");
    const hospitalRegion = fragment.querySelector(".hospital-region");
    const hospitalMeta = getHospitalMeta(item);

    fragment.querySelector(".hospital-name").textContent = getItemHospitalName(item);
    if (hospitalMeta) {
      hospitalRegion.textContent = hospitalMeta;
      hospitalRegion.hidden = false;
    }
    fragment.querySelector(".job-total").textContent = `${getItemJobCount(item)} 个岗位`;
    fragment.querySelector(".publish-time").textContent = getItemPublishDate(item) || "待补充";
    fragment.querySelector(".source-title").textContent = getItemSourceTitle(item);

    createJobList(item, detail);
    configureApplyLink(item, fragment);
    configureRowToggle(fragment);

    resultsList.appendChild(fragment);
  });
}

function applyFilter() {
  const keyword = normalizeKeyword(searchInput.value);
  const province = provinceFilter.value;
  const currentRegion = regionFilter.value;

  populateSelect(
    regionFilter,
    getRegionOptions(state.items, province),
    "全部地区",
  );
  if (currentRegion && regionFilter.value !== currentRegion) {
    regionFilter.value = "";
  }

  const region = regionFilter.value;
  state.filteredItems = state.items.filter((item) => {
    if (province && getItemProvince(item) !== province) {
      return false;
    }
    if (region && getItemRegion(item) !== region) {
      return false;
    }
    if (keyword && !buildSearchText(item).includes(keyword)) {
      return false;
    }
    return true;
  });
  render(state.filteredItems);
}

async function loadItems() {
  resultMeta.textContent = "正在加载招聘公告...";
  updateTime.textContent = "更新时间：正在加载...";
  const response = await fetch("./recruitment.json", { cache: "no-store" });
  const payload = await response.json();
  state.items = Array.isArray(payload.items) ? payload.items : [];
  state.filteredItems = [...state.items];
  updateTime.textContent = payload.generated_at
    ? `更新时间：${payload.generated_at}`
    : "更新时间：暂无";
  refreshFilters();
  render(state.filteredItems);
}

searchInput.addEventListener("input", applyFilter);
searchButton.addEventListener("click", applyFilter);
provinceFilter.addEventListener("change", applyFilter);
regionFilter.addEventListener("change", applyFilter);

loadItems().catch(() => {
  emptyState.hidden = false;
  resultMeta.textContent = "加载招聘公告失败，请重新生成站点数据。";
  updateTime.textContent = "更新时间：加载失败";
});
