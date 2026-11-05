import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { validateSettingsUpdate } from "@/lib/validation";
import { docClient, DYNAMODB_TABLE } from "@/lib/aws";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { EmergencySettings } from "@/context/IncidentContext";

const DEFAULT_SETTINGS: EmergencySettings = {
  campusName: "University Metropolis Campus",
  dispatchHotline: "+1 (555) 991-1111",
  dispatchChannel: "DISPATCH-SEC-1",
  isConfigured: true,
  autoEscalateCritical: true,
  soundAlerts: true,
  aiAutoTriage: true,
};

/**
 * GET /api/settings
 * Retrieves campus emergency settings for authenticated operators.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ["Supervisor", "Dispatcher"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: "CONFIG#SETTINGS",
        },
      })
    );

    const settings: EmergencySettings = res.Item
      ? {
          campusName: res.Item.campusName,
          dispatchHotline: res.Item.dispatchHotline,
          dispatchChannel: res.Item.dispatchChannel,
          isConfigured: res.Item.isConfigured ?? true,
          autoEscalateCritical: res.Item.autoEscalateCritical ?? true,
          soundAlerts: res.Item.soundAlerts ?? true,
          aiAutoTriage: res.Item.aiAutoTriage ?? true,
        }
      : DEFAULT_SETTINGS;

    return NextResponse.json({
      success: true,
      data: settings,
      campusId: auth.user.campusId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch settings";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve emergency settings.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 * Updates campus emergency settings.
 * Restricted strictly to verified Supervisor accounts.
 */
export async function PATCH(request: Request) {
  // Only Supervisors may modify emergency configuration
  const auth = await authenticateRequest(request, ["Supervisor"]);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const validation = validateSettingsUpdate(body);
  if (!validation.success || !validation.data) {
    return NextResponse.json(
      {
        success: false,
        error: "Settings validation failed.",
        errors: validation.errors,
      },
      { status: 400 }
    );
  }

  const updates = validation.data;
  const now = new Date().toISOString();

  try {
    const updateExpressions: string[] = ["updatedAt = :now", "updatedBy = :user"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expressionAttributeValues: Record<string, any> = {
      ":now": now,
      ":user": auth.user.email,
    };

    if (updates.campusName !== undefined) {
      updateExpressions.push("campusName = :cname");
      expressionAttributeValues[":cname"] = updates.campusName;
    }

    if (updates.dispatchHotline !== undefined) {
      updateExpressions.push("dispatchHotline = :hotline, isConfigured = :isConf");
      expressionAttributeValues[":hotline"] = updates.dispatchHotline;
      expressionAttributeValues[":isConf"] = Boolean(updates.dispatchHotline.trim());
    }

    if (updates.dispatchChannel !== undefined) {
      updateExpressions.push("dispatchChannel = :channel");
      expressionAttributeValues[":channel"] = updates.dispatchChannel;
    }

    if (updates.autoEscalateCritical !== undefined) {
      updateExpressions.push("autoEscalateCritical = :autoEsc");
      expressionAttributeValues[":autoEsc"] = updates.autoEscalateCritical;
    }

    if (updates.soundAlerts !== undefined) {
      updateExpressions.push("soundAlerts = :sound");
      expressionAttributeValues[":sound"] = updates.soundAlerts;
    }

    if (updates.aiAutoTriage !== undefined) {
      updateExpressions.push("aiAutoTriage = :triage");
      expressionAttributeValues[":triage"] = updates.aiAutoTriage;
    }

    const updatedRes = await docClient.send(
      new UpdateCommand({
        TableName: DYNAMODB_TABLE,
        Key: {
          pk: auth.user.campusId,
          sk: "CONFIG#SETTINGS",
        },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const saved = updatedRes.Attributes;
    const resultSettings: EmergencySettings = {
      campusName: saved?.campusName || DEFAULT_SETTINGS.campusName,
      dispatchHotline: saved?.dispatchHotline || DEFAULT_SETTINGS.dispatchHotline,
      dispatchChannel: saved?.dispatchChannel || DEFAULT_SETTINGS.dispatchChannel,
      isConfigured: saved?.isConfigured ?? true,
      autoEscalateCritical: saved?.autoEscalateCritical ?? true,
      soundAlerts: saved?.soundAlerts ?? true,
      aiAutoTriage: saved?.aiAutoTriage ?? true,
    };

    return NextResponse.json({
      success: true,
      data: resultSettings,
      updatedBy: auth.user.email,
      updatedAt: now,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update settings";
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update emergency settings.",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}

