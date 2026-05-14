/* ============================================================
   Supertonic TTS — Frontend JavaScript
   Handles: TTS synthesis, performance sidebar, load testing,
            latency chart, history, and live system metrics.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    // ---- DOM References ----
    const sidebar        = document.getElementById("perf-sidebar");
    const btnOpenSidebar = document.getElementById("btn-open-sidebar");
    const btnCloseSidebar= document.getElementById("btn-close-sidebar");
    const btnSynthesize  = document.getElementById("btn-synthesize");
    const btnText        = document.querySelector(".btn-text");
    const btnLoader      = document.getElementById("btn-loader");
    const ttsInput       = document.getElementById("tts-input");
    const charCount      = document.getElementById("char-count");
    const voiceSelect    = document.getElementById("voice-select");
    const langSelect     = document.getElementById("lang-select");
    const resultSection  = document.getElementById("result-section");
    const audioPlayer    = document.getElementById("audio-player");
    const historyList    = document.getElementById("history-list");
    const statusDot      = document.getElementById("status-dot");
    const statusText     = document.getElementById("status-text");

    // Stats chips
    const statLatency = document.getElementById("stat-latency");
    const statDuration= document.getElementById("stat-duration");
    const statRtf     = document.getElementById("stat-rtf");
    const statSize    = document.getElementById("stat-size");

    // Perf bars
    const perfBarLatency = document.getElementById("perf-bar-latency");
    const perfValLatency = document.getElementById("perf-val-latency");
    const perfBarCpu     = document.getElementById("perf-bar-cpu");
    const perfValCpu     = document.getElementById("perf-val-cpu");
    const perfBarRam     = document.getElementById("perf-bar-ram");
    const perfValRam     = document.getElementById("perf-val-ram");

    // Sidebar elements
    const systemInfo     = document.getElementById("system-info");
    const liveCpu        = document.getElementById("live-cpu");
    const liveRam        = document.getElementById("live-ram");
    const liveRequests   = document.getElementById("live-requests");
    const liveAvgLatency = document.getElementById("live-avg-latency");
    const perfLogBody    = document.getElementById("perf-log-body");

    // Load test
    const btnLoadTest      = document.getElementById("btn-load-test");
    const loadCountInput   = document.getElementById("load-count");
    const loadConcurrency  = document.getElementById("load-concurrency");
    const loadTestResults  = document.getElementById("load-test-results");

    // ---- State ----
    let requestCount = 0;
    let totalLatency = 0;
    let latencyHistory = [];
    let historyItems = [];
    let latencyChart = null;
    let isFirstHistory = true;

    // ---- Sidebar Toggle ----
    btnOpenSidebar.addEventListener("click", () => {
        sidebar.classList.add("open");
        document.body.classList.add("sidebar-open");
        refreshPerformanceData();
    });

    btnCloseSidebar.addEventListener("click", () => {
        sidebar.classList.remove("open");
        document.body.classList.remove("sidebar-open");
    });

    // ---- Character Count ----
    function updateCharCount() {
        const len = ttsInput.value.length;
        const max = ttsInput.getAttribute("maxlength");
        charCount.textContent = `${len} / ${max}`;
    }
    ttsInput.addEventListener("input", updateCharCount);
    updateCharCount();

    // ---- Status Helpers ----
    function setStatus(state, text) {
        statusText.textContent = text;
        if (state === "busy") {
            statusDot.classList.add("busy");
        } else {
            statusDot.classList.remove("busy");
        }
    }

    // ---- Initialize Latency Chart ----
    function initChart() {
        const ctx = document.getElementById("latency-chart").getContext("2d");
        latencyChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: [],
                datasets: [{
                    label: "Latency (s)",
                    data: [],
                    borderColor: "#6366f1",
                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: "#a855f7",
                    pointBorderColor: "#6366f1",
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(17, 24, 39, 0.9)",
                        titleColor: "#f1f5f9",
                        bodyColor: "#94a3b8",
                        borderColor: "rgba(255,255,255,0.08)",
                        borderWidth: 1,
                        cornerRadius: 8,
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { color: "rgba(255,255,255,0.04)" },
                        ticks: { color: "#64748b", font: { size: 10 } },
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        grid: { color: "rgba(255,255,255,0.04)" },
                        ticks: {
                            color: "#64748b",
                            font: { size: 10 },
                            callback: (v) => v.toFixed(2) + "s"
                        },
                    }
                }
            }
        });
    }
    initChart();

    function addChartPoint(latency) {
        const label = `#${requestCount}`;
        latencyChart.data.labels.push(label);
        latencyChart.data.datasets[0].data.push(latency);
        if (latencyChart.data.labels.length > 30) {
            latencyChart.data.labels.shift();
            latencyChart.data.datasets[0].data.shift();
        }
        latencyChart.update("none");
    }

    // ---- Synthesize ----
    btnSynthesize.addEventListener("click", async () => {
        const text = ttsInput.value.trim();
        if (!text) {
            ttsInput.focus();
            return;
        }

        // UI: loading state
        btnSynthesize.disabled = true;
        btnText.classList.add("hidden");
        btnLoader.classList.remove("hidden");
        setStatus("busy", "Synthesizing...");

        try {
            const res = await fetch("/api/synthesize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: text,
                    voice: voiceSelect.value,
                    lang: langSelect.value,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Synthesis failed");
            }

            // Update result card
            audioPlayer.src = data.audio_url;
            resultSection.classList.remove("hidden");
            audioPlayer.play();

            const p = data.perf;

            // Stats chips
            statLatency.textContent  = `⏱️ ${data.latency}s`;
            statDuration.textContent = `🕐 ${data.duration}s`;
            statRtf.textContent      = `⚡ RTF: ${p.realtime_factor}x`;
            statSize.textContent     = `📦 ${p.file_size_kb} KB`;

            // Performance bars
            const maxLatency = 10;
            perfBarLatency.style.width = `${Math.min(data.latency / maxLatency * 100, 100)}%`;
            perfValLatency.textContent = `${data.latency}s`;

            perfBarCpu.style.width = `${p.cpu_after_pct}%`;
            perfValCpu.textContent = `${p.cpu_after_pct}%`;

            const ramDelta = Math.abs(p.ram_delta_mb);
            perfBarRam.style.width = `${Math.min(ramDelta / 500 * 100, 100)}%`;
            perfValRam.textContent = `${p.ram_delta_mb > 0 ? "+" : ""}${p.ram_delta_mb} MB`;

            // Track stats
            requestCount++;
            totalLatency += data.latency;
            latencyHistory.push(data.latency);
            addChartPoint(data.latency);

            // Update sidebar live metrics
            liveCpu.textContent = `${p.cpu_after_pct}%`;
            liveRam.textContent = `${p.ram_after_mb} MB`;
            liveRequests.textContent = requestCount;
            liveAvgLatency.textContent = (totalLatency / requestCount).toFixed(3) + "s";

            // Add to history
            addHistoryItem(text, data);

            // Add to log table
            addLogRow(p);

            setStatus("ok", "Ready");

        } catch (err) {
            setStatus("ok", "Error occurred");
            alert("Error: " + err.message);
        } finally {
            btnSynthesize.disabled = false;
            btnText.classList.remove("hidden");
            btnLoader.classList.add("hidden");
        }
    });

    // ---- History ----
    function addHistoryItem(text, data) {
        if (isFirstHistory) {
            historyList.innerHTML = "";
            isFirstHistory = false;
        }

        const item = document.createElement("div");
        item.className = "history-item";

        const truncated = text.length > 80 ? text.substring(0, 80) + "…" : text;

        item.innerHTML = `
            <span class="history-text">${escapeHtml(truncated)}</span>
            <div class="history-meta">
                <span class="stat-chip">⏱️ ${data.latency}s</span>
                <span class="stat-chip">🕐 ${data.duration}s</span>
            </div>
            <audio class="history-audio" controls src="${data.audio_url}"></audio>
        `;

        historyList.prepend(item);

        // Keep max 20 items
        while (historyList.children.length > 20) {
            historyList.removeChild(historyList.lastChild);
        }
    }

    // ---- Log Table ----
    function addLogRow(perf) {
        // Remove "no requests" row
        const emptyRow = perfLogBody.querySelector(".empty-row");
        if (emptyRow) emptyRow.parentElement.remove();

        const row = document.createElement("tr");
        const time = new Date().toLocaleTimeString();
        const statusClass = perf.status === "success" ? "status-ok" : "status-err";

        row.innerHTML = `
            <td>${requestCount}</td>
            <td>${time}</td>
            <td>${perf.latency_s}s</td>
            <td>${perf.audio_duration_s}s</td>
            <td>${perf.realtime_factor}x</td>
            <td>${perf.cpu_after_pct}%</td>
            <td class="${statusClass}">${perf.status === "success" ? "✓" : "✗"}</td>
        `;

        // Add to top
        perfLogBody.prepend(row);
    }

    // ---- System Info ----
    async function loadSystemInfo() {
        try {
            const res = await fetch("/api/system");
            const data = await res.json();

            systemInfo.innerHTML = `
                <span class="sys-label">Environment</span><span class="sys-value">${data.environment}</span>
                <span class="sys-label">Hostname</span><span class="sys-value">${data.hostname}</span>
                <span class="sys-label">Platform</span><span class="sys-value">${truncate(data.platform, 25)}</span>
                <span class="sys-label">Arch</span><span class="sys-value">${data.architecture}</span>
                <span class="sys-label">Python</span><span class="sys-value">${data.python_version}</span>
                <span class="sys-label">CPUs</span><span class="sys-value">${data.cpu_count}</span>
                <span class="sys-label">CPU MHz</span><span class="sys-value">${data.cpu_freq_mhz}</span>
                <span class="sys-label">CPU Usage</span><span class="sys-value">${data.cpu_usage_pct}%</span>
                <span class="sys-label">RAM Total</span><span class="sys-value">${data.ram_total_mb} MB</span>
                <span class="sys-label">RAM Used</span><span class="sys-value">${data.ram_used_mb} MB</span>
                <span class="sys-label">RAM Usage</span><span class="sys-value">${data.ram_usage_pct}%</span>
            `;

            liveCpu.textContent = `${data.cpu_usage_pct}%`;
            liveRam.textContent = `${data.ram_used_mb} MB`;

        } catch (e) {
            systemInfo.innerHTML = `<p class="loading-text">Failed to load</p>`;
        }
    }

    async function refreshPerformanceData() {
        await loadSystemInfo();
        // Also refresh from server perf log
        try {
            const res = await fetch("/api/performance");
            const data = await res.json();
            // Could sync server-side logs here if needed
        } catch (e) { /* ignore */ }
    }

    // Load system info on page load
    loadSystemInfo();

    // Refresh system info every 10 seconds
    setInterval(() => {
        if (sidebar.classList.contains("open")) {
            loadSystemInfo();
        }
    }, 10000);

    // ---- Load Testing ----
    btnLoadTest.addEventListener("click", async () => {
        const count = parseInt(loadCountInput.value) || 10;
        const concurrency = parseInt(loadConcurrency.value) || 3;

        btnLoadTest.disabled = true;
        btnLoadTest.textContent = "Running...";
        loadTestResults.classList.remove("hidden");
        loadTestResults.innerHTML = `<div class="lr-title">🔄 Running load test: ${count} requests, concurrency ${concurrency}...</div>`;

        const testText = "Hello, this is a load test for measuring throughput and latency under stress.";
        const results = [];
        let completed = 0;
        let errors = 0;

        const startAll = performance.now();

        // Send requests in batches of `concurrency`
        for (let i = 0; i < count; i += concurrency) {
            const batch = [];
            for (let j = 0; j < concurrency && (i + j) < count; j++) {
                batch.push(
                    (async () => {
                        const start = performance.now();
                        try {
                            const res = await fetch("/api/synthesize", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ text: testText, voice: "M1", lang: "en" }),
                            });
                            const data = await res.json();
                            const elapsed = (performance.now() - start) / 1000;
                            if (res.ok) {
                                results.push({
                                    latency: elapsed,
                                    serverLatency: data.latency,
                                    duration: data.duration,
                                });
                                completed++;
                                requestCount++;
                                totalLatency += data.latency;
                                addChartPoint(data.latency);
                            } else {
                                errors++;
                            }
                        } catch (e) {
                            errors++;
                        }
                    })()
                );
            }
            await Promise.all(batch);

            // Progress update
            const progress = Math.min(i + concurrency, count);
            loadTestResults.innerHTML = `<div class="lr-title">🔄 Progress: ${progress}/${count} requests...</div>`;
        }

        const totalTime = (performance.now() - startAll) / 1000;

        // Compute stats
        const latencies = results.map(r => r.serverLatency).sort((a, b) => a - b);
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const min = latencies[0];
        const max = latencies[latencies.length - 1];
        const p50 = latencies[Math.floor(latencies.length * 0.5)];
        const p95 = latencies[Math.floor(latencies.length * 0.95)];
        const p99 = latencies[Math.floor(latencies.length * 0.99)];
        const rps = completed / totalTime;

        loadTestResults.innerHTML = `
            <div class="lr-title">📊 Load Test Results</div>
            <div>Total Requests : ${count}</div>
            <div>Completed      : ${completed}</div>
            <div>Errors         : ${errors}</div>
            <div>Total Time     : ${totalTime.toFixed(2)}s</div>
            <div>Throughput     : ${rps.toFixed(2)} req/s</div>
            <div>──────────────────────</div>
            <div>Avg Latency    : ${avg.toFixed(4)}s</div>
            <div>Min Latency    : ${min.toFixed(4)}s</div>
            <div>Max Latency    : ${max.toFixed(4)}s</div>
            <div>P50 Latency    : ${p50.toFixed(4)}s</div>
            <div>P95 Latency    : ${p95.toFixed(4)}s</div>
            <div>P99 Latency    : ${p99.toFixed(4)}s</div>
        `;

        // Update sidebar live
        liveRequests.textContent = requestCount;
        liveAvgLatency.textContent = (totalLatency / requestCount).toFixed(3) + "s";

        btnLoadTest.disabled = false;
        btnLoadTest.textContent = "Run Load Test";
    });

    // ---- Utilities ----
    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function truncate(str, len) {
        return str.length > len ? str.substring(0, len) + "…" : str;
    }
});
