CREATE TABLE IF NOT EXISTS columns_table (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  position INT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  column_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  due_date DATE NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cards_column FOREIGN KEY (column_id) REFERENCES columns_table(id) ON DELETE CASCADE
);

INSERT INTO columns_table (id, name, position) VALUES
  (1, 'To Do', 1),
  (2, 'In Progress', 2),
  (3, 'Done', 3)
ON DUPLICATE KEY UPDATE name = VALUES(name), position = VALUES(position);

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 2, 'Fix login redirect bug', 'Users are being sent to the wrong dashboard after signing in. This affects the demo flow and should be verified across user roles.', 'normal', CURDATE(), 1
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Fix login redirect bug');

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 1, 'Complete payment integration', 'Connect the checkout form to the backend payment endpoint, handle failed payments, and confirm the success state in the UI.', 'normal', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 1
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Complete payment integration');

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 1, 'Contact group lead', 'Confirm scope expectations, ask whether the AI summary should be evaluated live, and clarify presentation timing.', 'normal', DATE_ADD(CURDATE(), INTERVAL 4 DAY), 2
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Contact group lead');

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 1, 'Write README setup notes', 'Document Docker startup, environment variables, Gemini API setup, and known tradeoffs for the interview submission.', 'normal', DATE_ADD(CURDATE(), INTERVAL 2 DAY), 3
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Write README setup notes');

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 1, 'Prepare demo script', 'Create a short walkthrough that shows creating cards, moving work between columns, sorting, and generating the AI daily summary.', 'normal', DATE_ADD(CURDATE(), INTERVAL 3 DAY), 4
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Prepare demo script');

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 2, 'Polish Kanban card styling', 'Improve spacing, empty states, mobile responsiveness, and the visual hierarchy of cards and columns.', 'normal', NULL, 2
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Polish Kanban card styling');

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 2, 'Add loading and error states', 'Make failed API calls and AI summary generation states clear to the user without disrupting the board.', 'normal', DATE_ADD(CURDATE(), INTERVAL 2 DAY), 3
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Add loading and error states');

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 1, 'Review database seed data', 'Make sure the seeded board has enough realistic tasks for the AI feature to produce a meaningful summary.', 'normal', NULL, 5
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Review database seed data');

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 3, 'Create base Docker setup', 'Frontend, backend, and MySQL containers run together through Docker Compose.', 'normal', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 1
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Create base Docker setup');

INSERT INTO cards (column_id, title, description, priority, due_date, position)
SELECT 3, 'Connect Gemini API', 'Backend can call Gemini and fall back to a local summary when no API key is configured.', 'normal', CURDATE(), 2
WHERE NOT EXISTS (SELECT 1 FROM cards WHERE title = 'Connect Gemini API');
