CREATE TYPE "public"."file_kind" AS ENUM('assignment', 'submission', 'feedback');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "file_kind" NOT NULL,
	"uploader_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"submission_id" uuid,
	"item_id" uuid,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"score" real NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_progress" (
	"student_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"practice" boolean DEFAULT false NOT NULL,
	"review" boolean DEFAULT false NOT NULL,
	"accuracy" integer,
	"confidence" integer,
	"read_on" date,
	"reviewed_on" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_progress_student_id_module_id_pk" PRIMARY KEY("student_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"exam_date" date NOT NULL,
	"plan_start" date NOT NULL,
	"weekly_target_minutes" integer DEFAULT 600 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "los_progress" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "question_los" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "study_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "los_progress" CASCADE;--> statement-breakpoint
DROP TABLE "plan_items" CASCADE;--> statement-breakpoint
DROP TABLE "question_los" CASCADE;--> statement-breakpoint
DROP TABLE "study_plans" CASCADE;--> statement-breakpoint
ALTER TABLE "attempts" DROP CONSTRAINT IF EXISTS "attempts_los_id_los_id_fk";
--> statement-breakpoint
ALTER TABLE "study_sessions" DROP CONSTRAINT IF EXISTS "study_sessions_plan_item_id_plan_items_id_fk";
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "module_id" uuid;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "plan_start" date;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "weekly_target_minutes" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "module_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "source" text DEFAULT 'authored' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "topic" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "study_weeks" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_item_id_assignment_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."assignment_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_results" ADD CONSTRAINT "mock_results_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_assignment_kind_idx" ON "files" USING btree ("assignment_id","kind");--> statement-breakpoint
CREATE INDEX "files_submission_idx" ON "files" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "mock_results_student_date_idx" ON "mock_results" USING btree ("student_id","date");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "modules_topic_slug_uq" ON "modules" USING btree ("topic_id","slug");--> statement-breakpoint
CREATE INDEX "questions_module_idx" ON "questions" USING btree ("module_id");--> statement-breakpoint
ALTER TABLE "attempts" DROP COLUMN "los_id";--> statement-breakpoint
ALTER TABLE "study_sessions" DROP COLUMN "plan_item_id";--> statement-breakpoint
DROP TYPE "public"."plan_item_status";