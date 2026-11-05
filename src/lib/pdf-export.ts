import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Incident } from "@/types/incident";
import { ResponseTeam } from "@/types/team";
import { ActivityEvent } from "@/types/incident";

export interface GeneratePdfOptions {
  incidents: Incident[];
  teams?: ResponseTeam[];
  activities?: ActivityEvent[];
  campusName?: string;
  compress?: boolean;
  operator?: {
    name?: string;
    email?: string;
    role?: string;
  };
}

export const PDF_FILENAME = "VIGILORA_Campus_Incident_Summary.pdf";

import { calculateResponseTelemetry, ResponseTelemetryResult } from "./telemetry";
export { calculateResponseTelemetry };
export type { ResponseTelemetryResult };

/**
 * Builds the official VIGILORA Incident Summary PDF with Victorian Gothic tactical styling.
 * Returns the jsPDF document instance ready for browser download or binary export.
 */
export function buildIncidentSummaryPdf(options: GeneratePdfOptions): jsPDF {
  const {
    incidents,
    teams = [],
    activities = [],
    campusName = "Metropolis Campus",
    compress = true,
    operator,
  } = options;

  // Initialize A4 document (210mm x 297mm)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  // Victorian Gothic Palette
  const COLOR_OBSIDIAN = [8, 13, 19] as [number, number, number]; // #080D13
  const COLOR_DEEP_CRIMSON = [135, 0, 10] as [number, number, number]; // #87000A
  const COLOR_BLOOD_RED = [240, 20, 32] as [number, number, number]; // #F01420
  const COLOR_IVORY = [232, 229, 226] as [number, number, number]; // #E8E5E2
  const COLOR_DARK_SLATE = [15, 23, 42] as [number, number, number]; // #0F172A
  const COLOR_MUTED = [100, 116, 139] as [number, number, number]; // #64748B
  const COLOR_CARD_BG = [248, 250, 252] as [number, number, number]; // #F8FAFC
  const COLOR_BORDER = [226, 232, 240] as [number, number, number]; // #E2E8F0

  // 1. Compute Incident Metrics Strictly from Real Data
  const totalIncidents = incidents.length;
  const activeIncidents = incidents.filter((i) => i.status !== "Resolved").length;
  const criticalIncidents = incidents.filter(
    (i) => i.severity === "Critical" && i.status !== "Resolved"
  ).length;
  const resolvedIncidents = incidents.filter((i) => i.status === "Resolved").length;
  const resolutionRate =
    totalIncidents > 0 ? Math.round((resolvedIncidents / totalIncidents) * 100) : 0;

  // Response Telemetry
  const responseTelemetry = calculateResponseTelemetry(incidents, activities);

  // Teams mapping
  const teamMap = new Map<string, string>();
  for (const t of teams) {
    teamMap.set(t.id, t.name);
  }

  // Sector distribution from real data
  const sectorCounts: Record<string, { total: number; critical: number; active: number }> = {};
  for (const inc of incidents) {
    const zone = inc.location?.zone || "Unspecified Sector";
    if (!sectorCounts[zone]) {
      sectorCounts[zone] = { total: 0, critical: 0, active: 0 };
    }
    sectorCounts[zone].total += 1;
    if (inc.severity === "Critical") sectorCounts[zone].critical += 1;
    if (inc.status !== "Resolved") sectorCounts[zone].active += 1;
  }

  // Category distribution from real data
  const categoryCounts: Record<string, { total: number; active: number }> = {};
  for (const inc of incidents) {
    const cat = inc.category || "General";
    if (!categoryCounts[cat]) {
      categoryCounts[cat] = { total: 0, active: 0 };
    }
    categoryCounts[cat].total += 1;
    if (inc.status !== "Resolved") categoryCounts[cat].active += 1;
  }

  // Generation timestamp
  const now = new Date();
  const generationTimestamp = now.toISOString().replace("T", " ").substring(0, 19) + " UTC";

  // Operator Info
  const operatorName = operator?.name || operator?.email || "Lead Dispatcher";
  const operatorRole = operator?.role ? operator.role.toUpperCase() : "TACTICAL DISPATCH";

  // ---------------------------------------------------------------------------
  // Top Header Banner (Obsidian with Crimson Trim)
  // ---------------------------------------------------------------------------
  doc.setFillColor(...COLOR_OBSIDIAN);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Crimson accent rule
  doc.setFillColor(...COLOR_DEEP_CRIMSON);
  doc.rect(0, 27, pageWidth, 1.2, "F");

  // Blood Red hairline
  doc.setFillColor(...COLOR_BLOOD_RED);
  doc.rect(0, 28.2, pageWidth, 0.4, "F");

  // VIGILORA Brand
  doc.setTextColor(...COLOR_BLOOD_RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("V I G I L O R A", marginX, 12);

  doc.setTextColor(...COLOR_IVORY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("CAMPUS DISPATCH & EMERGENCY RESPONSE TELEMETRY", marginX, 17.5);

  doc.setTextColor(...COLOR_MUTED);
  doc.setFontSize(6.5);
  doc.text(`SECURITY JURISDICTION: ${campusName.toUpperCase()}`, marginX, 22.5);

  // Right Header Metadata
  const rightX = pageWidth - marginX;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...COLOR_BLOOD_RED);
  doc.text("DEMONSTRATION REPORT • SECURE DISPATCH", rightX, 10, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...COLOR_IVORY);
  doc.text(`Generated: ${generationTimestamp}`, rightX, 15, { align: "right" });
  doc.text(`Operator: ${operatorName} [${operatorRole}]`, rightX, 19.5, { align: "right" });
  doc.text("Classification: SENSITIVE CAMPUS TELEMETRY", rightX, 24, { align: "right" });

  // ---------------------------------------------------------------------------
  // Section 1: Executive Operational Summary
  // ---------------------------------------------------------------------------
  let currentY = 35;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_DEEP_CRIMSON);
  doc.text("1. EXECUTIVE OPERATIONAL SUMMARY", marginX, currentY);

  currentY += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_DARK_SLATE);
  const narrative =
    `Official incident resolution summary for ${campusName}. This document consolidates current logged reports, ` +
    `tactical unit assignments, and localized risk distributions. All statistics herein reflect live authenticated ` +
    `database records. Unverified or missing metrics are explicitly identified as not available in compliance with ` +
    `strict tactical telemetry standards.`;
  const narrativeLines = doc.splitTextToSize(narrative, contentWidth);
  doc.text(narrativeLines, marginX, currentY);
  currentY += narrativeLines.length * 3.8 + 3;

  // KPI Metric Cards (4 Cards across content width)
  const cardWidth = (contentWidth - 9) / 4; // 4 cards with 3mm gap
  const cardHeight = 18;
  const cards = [
    {
      label: "TOTAL INCIDENTS",
      value: String(totalIncidents),
      subtext: "Logged campus-wide",
      highlight: false,
    },
    {
      label: "ACTIVE WORKLOAD",
      value: String(activeIncidents),
      subtext: `${totalIncidents > 0 ? Math.round((activeIncidents / totalIncidents) * 100) : 0}% unresolved`,
      highlight: false,
    },
    {
      label: "CRITICAL HAZARDS",
      value: String(criticalIncidents),
      subtext: criticalIncidents > 0 ? "Immediate priority" : "Zero active",
      highlight: criticalIncidents > 0,
    },
    {
      label: "RESOLVED CASES",
      value: String(resolvedIncidents),
      subtext: `${resolutionRate}% clearance rate`,
      highlight: false,
    },
  ];

  cards.forEach((card, idx) => {
    const cardX = marginX + idx * (cardWidth + 3);
    doc.setFillColor(...COLOR_CARD_BG);
    doc.setDrawColor(
      card.highlight ? COLOR_BLOOD_RED[0] : COLOR_BORDER[0],
      card.highlight ? COLOR_BLOOD_RED[1] : COLOR_BORDER[1],
      card.highlight ? COLOR_BLOOD_RED[2] : COLOR_BORDER[2]
    );
    doc.setLineWidth(card.highlight ? 0.4 : 0.2);
    doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 1.5, 1.5, "FD");

    // Header label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(card.label, cardX + 3, currentY + 4.5);

    // Metric Value
    doc.setFontSize(13);
    if (card.highlight) {
      doc.setTextColor(...COLOR_BLOOD_RED);
    } else {
      doc.setTextColor(...COLOR_DARK_SLATE);
    }
    doc.text(card.value, cardX + 3, currentY + 11.5);

    // Subtext
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(card.subtext, cardX + 3, currentY + 15.5);
  });

  currentY += cardHeight + 6;

  // ---------------------------------------------------------------------------
  // Section 2: Response Velocity & Telemetry Audit
  // ---------------------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_DEEP_CRIMSON);
  doc.text("2. DISPATCH VELOCITY & TELEMETRY AUDIT", marginX, currentY);

  currentY += 4.5;
  const panelHeight = 18;
  doc.setFillColor(...COLOR_CARD_BG);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(marginX, currentY, contentWidth, panelHeight, 1.5, 1.5, "FD");

  // Left column: Response time stats
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...COLOR_DARK_SLATE);
  doc.text("Mean Emergency Response Velocity:", marginX + 4, currentY + 5);

  if (responseTelemetry.available && responseTelemetry.meanMinutes !== null && responseTelemetry.meanMinutes !== undefined) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_DEEP_CRIMSON);
    doc.text(
      `${responseTelemetry.meanMinutes} minutes (Fastest: ${responseTelemetry.fastestMinutes}m | Slowest: ${responseTelemetry.slowestMinutes}m across ${responseTelemetry.eligibleCount} verified genuine events)`,
      marginX + 54,
      currentY + 5
    );
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_DARK_SLATE);
    doc.text("--", marginX + 54, currentY + 5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...COLOR_BLOOD_RED);
    doc.text("[INSUFFICIENT VERIFIED RESPONSE DATA]", marginX + 61, currentY + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      `(${responseTelemetry.eligibleCount} eligible incidents)`,
      marginX + 118,
      currentY + 5
    );
  }

  // Explanation audit rule
  doc.setFont("helvetica", "italic");
  doc.setFontSize(5.5);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(
    `Audit Standard: ${responseTelemetry.explanation}`,
    marginX + 4,
    currentY + 9
  );

  // Active teams deployed
  const activeTeams = teams.filter((t) => t.status !== "Available" && t.status !== "Off Duty");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...COLOR_DARK_SLATE);
  doc.text("Active Tactical Deployment:", marginX + 4, currentY + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLOR_MUTED);
  if (teams.length > 0) {
    const activeNames = activeTeams.map((t) => `${t.id} (${t.status})`).join(", ");
    doc.text(
      `${activeTeams.length} of ${teams.length} tactical units deployed ${activeNames ? `• [${activeNames}]` : "• All units currently standing by"}`,
      marginX + 45,
      currentY + 14
    );
  } else {
    doc.text("Tactical team roster not loaded", marginX + 45, currentY + 14);
  }

  currentY += panelHeight + 6;

  // ---------------------------------------------------------------------------
  // Section 3: Distribution Breakdown (Category & Sector Tables)
  // ---------------------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_DEEP_CRIMSON);
  doc.text("3. INCIDENT DISTRIBUTION BY CATEGORY & SECTOR", marginX, currentY);

  currentY += 4;

  const halfWidth = (contentWidth - 4) / 2;

  // Category Distribution Rows
  const catEntries = Object.entries(categoryCounts);
  const catRows =
    catEntries.length > 0
      ? catEntries.map(([cat, data]) => [
          cat,
          String(data.total),
          `${totalIncidents > 0 ? Math.round((data.total / totalIncidents) * 100) : 0}%`,
          String(data.active),
        ])
      : [["Not available", "0", "0%", "0"]];

  // Sector Distribution Rows
  const sectorEntries = Object.entries(sectorCounts);
  const sectorRows =
    sectorEntries.length > 0
      ? sectorEntries.map(([sector, data]) => [
          sector,
          String(data.total),
          `${totalIncidents > 0 ? Math.round((data.total / totalIncidents) * 100) : 0}%`,
          String(data.critical),
        ])
      : [["Not available", "0", "0%", "0"]];

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX + halfWidth + 4 },
    tableWidth: halfWidth,
    head: [["Category", "Total", "%", "Active"]],
    body: catRows,
    theme: "plain",
    headStyles: {
      fillColor: COLOR_OBSIDIAN,
      textColor: [255, 255, 255],
      fontSize: 6.5,
      fontStyle: "bold",
      halign: "left",
      cellPadding: 1.5,
    },
    bodyStyles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      textColor: COLOR_DARK_SLATE,
    },
    alternateRowStyles: {
      fillColor: COLOR_CARD_BG,
    },
  });

  // Second table side-by-side
  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX + halfWidth + 4, right: marginX },
    tableWidth: halfWidth,
    head: [["Sector / Zone", "Total", "%", "Critical"]],
    body: sectorRows,
    theme: "plain",
    headStyles: {
      fillColor: COLOR_OBSIDIAN,
      textColor: [255, 255, 255],
      fontSize: 6.5,
      fontStyle: "bold",
      halign: "left",
      cellPadding: 1.5,
    },
    bodyStyles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      textColor: COLOR_DARK_SLATE,
    },
    alternateRowStyles: {
      fillColor: COLOR_CARD_BG,
    },
  });

  // Calculate next startY from autoTable
  const finalCatY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || currentY + 25;
  currentY = Math.max(finalCatY + 6, currentY + 25);

  // ---------------------------------------------------------------------------
  // Section 4: Verified Campus Incident Manifest Table
  // ---------------------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_DEEP_CRIMSON);
  doc.text("4. VERIFIED CAMPUS INCIDENT MANIFEST", marginX, currentY);

  currentY += 4;

  const incidentRows =
    incidents.length > 0
      ? incidents.map((inc) => {
          const locationParts = [
            inc.location?.zone,
            inc.location?.building,
            inc.location?.landmark,
          ].filter(Boolean);
          const locationStr = locationParts.join(" • ") || "Campus Grounds";

          const assignedTeamName = inc.assignedTeamId
            ? teamMap.get(inc.assignedTeamId) || inc.assignedTeamId
            : inc.assignedResponder || "Unassigned";

          let reportedStr = "Not recorded";
          if (inc.reportedAt) {
            try {
              const d = new Date(inc.reportedAt);
              if (!isNaN(d.getTime())) {
                reportedStr = d.toISOString().replace("T", " ").substring(0, 16);
              }
            } catch {
              reportedStr = inc.reportedAt;
            }
          }

          return [
            inc.id,
            inc.title,
            inc.severity,
            inc.category,
            locationStr,
            assignedTeamName,
            inc.status,
            reportedStr,
          ];
        })
      : [["-", "No incident records logged in the operational database", "-", "-", "-", "-", "-", "-"]];

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX, bottom: 18 },
    tableWidth: contentWidth,
    head: [
      [
        "ID",
        "Incident Title",
        "Severity",
        "Category",
        "Location",
        "Assigned Unit",
        "Status",
        "Reported (UTC)",
      ],
    ],
    body: incidentRows,
    theme: "striped",
    headStyles: {
      fillColor: COLOR_OBSIDIAN,
      textColor: [255, 255, 255],
      fontSize: 6.5,
      fontStyle: "bold",
      halign: "left",
      cellPadding: 2,
    },
    bodyStyles: {
      fontSize: 6.5,
      cellPadding: 2,
      textColor: COLOR_DARK_SLATE,
    },
    alternateRowStyles: {
      fillColor: COLOR_CARD_BG,
    },
    columnStyles: {
      0: { cellWidth: 20, fontStyle: "bold" }, // ID
      1: { cellWidth: 36 }, // Title
      2: { cellWidth: 16, fontStyle: "bold" }, // Severity
      3: { cellWidth: 24 }, // Category
      4: { cellWidth: 32 }, // Location
      5: { cellWidth: 20 }, // Unit
      6: { cellWidth: 16 }, // Status
      7: { cellWidth: 18 }, // Reported
    },
    didParseCell: (data) => {
      // Color-code severity column (column index 2)
      if (data.section === "body" && data.column.index === 2) {
        const val = String(data.cell.raw).toLowerCase();
        if (val.includes("critical")) {
          data.cell.styles.textColor = COLOR_BLOOD_RED;
          data.cell.styles.fontStyle = "bold";
        } else if (val.includes("high")) {
          data.cell.styles.textColor = [234, 88, 12];
          data.cell.styles.fontStyle = "bold";
        } else if (val.includes("medium")) {
          data.cell.styles.textColor = [217, 119, 6];
        } else {
          data.cell.styles.textColor = COLOR_MUTED;
        }
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Page Numbers & Footer on All Pages
  // ---------------------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);

    // Footer divider line
    const footerY = pageHeight - 12;
    doc.setDrawColor(...COLOR_DEEP_CRIMSON);
    doc.setLineWidth(0.4);
    doc.line(marginX, footerY, pageWidth - marginX, footerY);

    // Left Footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      "VIGILORA Tactical Command System • Security & Emergency Services Enclave",
      marginX,
      footerY + 4
    );

    // Center Footer
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLOR_DEEP_CRIMSON);
    doc.text("CONFIDENTIAL • DEMONSTRATION RECORD", pageWidth / 2, footerY + 4, {
      align: "center",
    });

    // Right Footer: Page X of Y
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - marginX, footerY + 4, {
      align: "right",
    });
  }

  return doc;
}

/**
 * Browser-friendly export function that builds the PDF and triggers a native file download.
 */
export async function downloadIncidentSummaryPdf(
  options: GeneratePdfOptions
): Promise<{ success: boolean; filename: string; error?: string }> {
  try {
    const doc = buildIncidentSummaryPdf(options);
    doc.save(PDF_FILENAME);
    return { success: true, filename: PDF_FILENAME };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate PDF document.";
    console.error("VIGILORA: PDF generation error:", err);
    return { success: false, filename: PDF_FILENAME, error: message };
  }
}
