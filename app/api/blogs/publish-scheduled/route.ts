import { NextRequest, NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // Vercel cron invocations include this user agent
  const userAgent = request.headers.get("user-agent") ?? "";
  if (userAgent.includes("vercel-cron")) return true;

  return false;
}

const logScheduledPublish = async (
  blogId: string,
  entityName: string | null,
  previousIsPublished: boolean,
  newIsPublished: boolean,
  scheduledFor: admin.firestore.Timestamp,
  error?: string,
) => {
  if (!adminDb) return;
  try {
    await adminDb.collection("cms_audit_logs").add({
      action: "update",
      entityType: "blog",
      entityId: blogId,
      entityName,
      metadata: {
        previousIsPublished,
        newIsPublished,
        scheduledFor: scheduledFor.toDate().toISOString(),
        error: error || null,
      },
      context: {
        source: "scheduled-publisher",
        collection: "blogs",
        bulk: true,
      },
      actor: null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (logError) {
    console.error("Failed to log scheduled publish event:", logError);
  }
};

const updateBlogStatusWithRetry = async (
  docRef: admin.firestore.DocumentReference,
  blogId: string,
  entityName: string | null,
  previousIsPublished: boolean,
  scheduledFor: admin.firestore.Timestamp,
  retriesLeft: number = MAX_RETRIES,
): Promise<boolean> => {
  try {
    // #region debug-point D:update-attempt
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"D",location:"publish-scheduled/route.ts:updateBlogStatusWithRetry",msg:"[DEBUG] attempting scheduled publish update",data:{blogId,entityName,previousIsPublished,scheduledFor:scheduledFor.toDate().toISOString(),retriesLeft},ts:Date.now()})}).catch(()=>{});
    // #endregion
    const now = admin.firestore.Timestamp.now();
    await docRef.update({
      isPublished: true,
      scheduledFor: admin.firestore.FieldValue.delete(),
      updatedAt: now,
    });
    await logScheduledPublish(
      blogId,
      entityName,
      previousIsPublished,
      true,
      scheduledFor,
    );
    // #region debug-point D:update-success
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"D",location:"publish-scheduled/route.ts:updateBlogStatusWithRetry",msg:"[DEBUG] scheduled publish update succeeded",data:{blogId,updatedAt:now.toDate().toISOString()},ts:Date.now()})}).catch(()=>{});
    // #endregion
    return true;
  } catch (error) {
    // #region debug-point D:update-error
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"D",location:"publish-scheduled/route.ts:updateBlogStatusWithRetry",msg:"[DEBUG] scheduled publish update failed",data:{blogId,retriesLeft,error:error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error)},ts:Date.now()})}).catch(()=>{});
    // #endregion
    if (retriesLeft > 0) {
      console.warn(
        `Retrying update for blog ${blogId}, attempts left: ${retriesLeft}`,
      );
      await delay(RETRY_DELAY_MS);
      return updateBlogStatusWithRetry(
        docRef,
        blogId,
        entityName,
        previousIsPublished,
        scheduledFor,
        retriesLeft - 1,
      );
    }
    console.error(
      `Failed to update blog ${blogId} after ${MAX_RETRIES} attempts:`,
      error,
    );
    await logScheduledPublish(
      blogId,
      entityName,
      previousIsPublished,
      true,
      scheduledFor,
      error instanceof Error ? error.message : "Unknown error",
    );
    return false;
  }
};

function isIndexError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed_precondition") ||
    msg.includes("requires an index") ||
    msg.includes("index")
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json(
      {
        error: "Firebase Admin not initialized",
        hint: "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your environment.",
      },
      { status: 500 },
    );
  }

  const executionStart = Date.now();
  console.log(
    "Starting scheduled blog publish check at",
    new Date().toISOString(),
  );

  try {
    const now = admin.firestore.Timestamp.now();
    // #region debug-point A:route-entry
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"A",location:"publish-scheduled/route.ts:GET",msg:"[DEBUG] scheduled publish route invoked",data:{now:now.toDate().toISOString()},ts:Date.now()})}).catch(()=>{});
    // #endregion

    const blogsRef = adminDb.collection("blogs");
    const snapshot = await blogsRef
      .where("isPublished", "==", false)
      .where("scheduledFor", "<=", now)
      .get();
    // #region debug-point B:query-results
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"B",location:"publish-scheduled/route.ts:GET",msg:"[DEBUG] scheduled publish query completed",data:{now:now.toDate().toISOString(),matchCount:snapshot.size,blogIds:snapshot.docs.map((entry)=>entry.id)},ts:Date.now()})}).catch(()=>{});
    // #endregion

    const updatedBlogs: string[] = [];
    const failedBlogs: string[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const previousIsPublished = data.isPublished as boolean;
      // #region debug-point C:document-evaluation
      fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"C",location:"publish-scheduled/route.ts:GET",msg:"[DEBUG] evaluating scheduled publish candidate",data:{blogId:doc.id,title:(data.title as string) ?? null,isPublished:data.isPublished ?? null,scheduledFor:data.scheduledFor?.toDate?.()?.toISOString?.() ?? null},ts:Date.now()})}).catch(()=>{});
      // #endregion

      if (previousIsPublished || !data.scheduledFor) {
        // #region debug-point C:document-skipped
        fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"C",location:"publish-scheduled/route.ts:GET",msg:"[DEBUG] scheduled publish candidate skipped",data:{blogId:doc.id,previousIsPublished,hasScheduledFor:Boolean(data.scheduledFor)},ts:Date.now()})}).catch(()=>{});
        // #endregion
        continue;
      }

      const success = await updateBlogStatusWithRetry(
        doc.ref,
        doc.id,
        (data.title as string) ?? null,
        previousIsPublished,
        data.scheduledFor as admin.firestore.Timestamp,
      );

      if (success) {
        updatedBlogs.push(doc.id);
      } else {
        failedBlogs.push(doc.id);
      }
    }

    const executionDuration = Date.now() - executionStart;

    console.log(`Scheduled publish check completed in ${executionDuration}ms`);
    console.log(`Updated ${updatedBlogs.length} blogs`);
    if (failedBlogs.length > 0) {
      console.log(
        `Failed to update ${failedBlogs.length} blogs:`,
        failedBlogs,
      );
    }

    return NextResponse.json({
      success: true,
      updatedBlogs,
      failedBlogs,
      count: updatedBlogs.length,
      executionDuration,
    });
  } catch (error) {
    // #region debug-point A:route-error
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"blog-schedule-not-publishing",runId:"pre-fix",hypothesisId:"A",location:"publish-scheduled/route.ts:GET",msg:"[DEBUG] scheduled publish route failed",data:{error:error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:String(error)},ts:Date.now()})}).catch(()=>{});
    // #endregion
    console.error("Error in scheduled blog publish check:", error);

    if (isIndexError(error)) {
      return NextResponse.json(
        {
          error: "Firestore composite index required",
          hint: "Deploy firestore.indexes.json via `firebase deploy --only firestore:indexes` or create the index manually in Firebase Console (blogs: isPublished ASC, scheduledFor ASC).",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to publish scheduled blogs",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}