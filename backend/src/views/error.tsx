/**
 * Error page component for user-facing errors.
 */

import { Layout } from './layout.js';

interface ErrorPageProps {
  title: string;
  message: string;
}

export function ErrorPage({ title, message }: ErrorPageProps) {
  return (
    <Layout title={`Error — EDH Deck Challenge`}>
      <div class="error-page">
        <h1>{title}</h1>
        <p>{message}</p>
        <a href="/">← Back to home</a>
      </div>
    </Layout>
  );
}
