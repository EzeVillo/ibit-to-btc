// Netlify redirect rules match paths with and without the final slash alike.
// Inspect the original URL before routing to avoid a self-redirecting 301.
export default function projectSlash(request: Request, context: { next(): Promise<Response> }) {
  const url = new URL(request.url);
  if (url.pathname === '/git-review-workflow') {
    url.pathname += '/';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}

export const config = { path: '/git-review-workflow' };
