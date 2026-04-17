-- Exams and Assessments Schema
-- Run this migration to add exam functionality

-- Exams table
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  subject VARCHAR(100) NOT NULL,
  difficulty_level VARCHAR(50) DEFAULT 'intermediate',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  passing_score INTEGER NOT NULL DEFAULT 70,
  total_questions INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  max_attempts INTEGER DEFAULT 3,
  randomize_questions BOOLEAN DEFAULT true,
  show_answers_after BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exam questions table
CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) DEFAULT 'multiple_choice',
  options JSONB DEFAULT '[]',
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  points INTEGER DEFAULT 1,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exam attempts table
CREATE TABLE IF NOT EXISTS exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  score INTEGER,
  total_points INTEGER,
  percentage DECIMAL(5,2),
  passed BOOLEAN,
  answers JSONB DEFAULT '{}',
  time_spent_seconds INTEGER,
  status VARCHAR(50) DEFAULT 'in_progress'
);

-- Exam certificates (for passed exams)
CREATE TABLE IF NOT EXISTS exam_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  certificate_number VARCHAR(100) UNIQUE NOT NULL,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(attempt_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exams_active ON exams(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_id ON exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_id ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_status ON exam_attempts(status);

-- RLS Policies
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_certificates ENABLE ROW LEVEL SECURITY;

-- Exams: Anyone can view active public exams
CREATE POLICY "Anyone can view active public exams"
  ON exams FOR SELECT
  USING (is_active = true AND is_public = true);

CREATE POLICY "Admins can manage exams"
  ON exams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Questions: Only visible during active attempt or to admins
CREATE POLICY "Questions visible during attempt"
  ON exam_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM exam_attempts
      WHERE exam_attempts.exam_id = exam_questions.exam_id
      AND exam_attempts.user_id = auth.uid()
      AND exam_attempts.status = 'in_progress'
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Attempts: Users manage their own
CREATE POLICY "Users manage their exam attempts"
  ON exam_attempts FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all attempts"
  ON exam_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Certificates: Users view their own, public verification
CREATE POLICY "Users view their certificates"
  ON exam_certificates FOR SELECT
  USING (user_id = auth.uid());

-- Function to update total_questions count
CREATE OR REPLACE FUNCTION update_exam_question_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE exams SET total_questions = total_questions + 1 WHERE id = NEW.exam_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE exams SET total_questions = total_questions - 1 WHERE id = OLD.exam_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_exam_question_count
AFTER INSERT OR DELETE ON exam_questions
FOR EACH ROW EXECUTE FUNCTION update_exam_question_count();
