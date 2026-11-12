/** Cancels a response's body unread, as a HEAD response's, which RFC 9110, section 9.3.2, says carries none, so a transport or a handler that streams one anyway is released; a body with no `cancel()`, as a Node stream a stand-in for a `Response` carries, is destroyed instead. Nothing it throws or rejects with escapes. */
export function release(response: Response): void
{
    void Promise.resolve().then(() =>
    {
        const body = response.body as { cancel?: () => unknown; destroy?: () => unknown } | null;
        return typeof body?.cancel === "function" ? body.cancel() : body?.destroy?.();
    }).catch(() => undefined);
}
