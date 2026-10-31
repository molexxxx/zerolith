<!-- Generated from the runtime's diagnostic catalog by npm run skills. -->

# Diagnostic codes

Every error and warning zerolith reports carries one of these codes and a link to https://molexxxx.github.io/zerolith/e/<code>/. Apply the fix the code names; never silence it.

## binding_in_comment

Cause: An expression appears inside an HTML comment.

Fix: Remove the expression from the comment; comments are static.

## binding_in_raw_text

Cause: An expression appears inside an element whose content is raw text.

Fix: Set the content of style, textarea, and title elements through a .textContent or .value property binding instead.

## binding_in_tag_position

Cause: An expression appears where a tag or attribute name is expected.

Fix: Bind values only as element content or inside an attribute value; tag and attribute names must be static.

## binding_not_single

Cause: A boolean attribute, property, or event binding has more than one expression or extra text.

Fix: Bind exactly one expression with nothing around it, for example ?disabled=${flag}.

## button_without_name

Cause: A <button> has no content and no aria-label, so it has no accessible name.

Fix: Put text inside the button, or add aria-label; an icon alone needs the label.

## computed_cycle

Cause: A computed value read itself, directly or through other computed values.

Fix: Break the cycle, for example by reading the previous value inside untracked().

## css_value_not_allowed

Cause: A css literal received a value that is not a number or another css result.

Fix: Interpolate only numbers and css results; put dynamic values in custom properties set through a style binding.

## each_key_duplicate

Cause: Two items in an each() list produced the same key.

Fix: Return a key that is unique within the list; duplicates make rows indistinguishable.

## each_key_undefined

Cause: The key function passed to each() returned undefined for an item.

Fix: Return a stable string or number per item, such as its id.

## effect_cycle

Cause: An effect was triggered synchronously while it was already running.

Fix: Do not write to a signal the effect reads from inside its own cleanup function.

## effect_loop

Cause: Effects kept re-triggering each other for more than 100 rounds in one batch.

Fix: Find the effect that writes a signal it also reads and make the write conditional.

## event_handler_not_function

Cause: An @event binding received something other than a function or an object with handleEvent.

Fix: Pass a function, for example @click=${() => count.set(count.get() + 1)}.

## frame_without_title

Cause: An <iframe> has no title attribute, so what it embeds is not announced.

Fix: Add a title that names the embedded content.

## hydration_mismatch

Cause: The server-rendered markup did not match the view, and the differing part was rendered again on the client.

Fix: Render the same view with the same data on the server and the client; check the mismatches returned by hydrate().

## image_without_alt

Cause: An <img> in a template has no alt attribute, so assistive technology has nothing to read for it.

Fix: Add alt text that says what the image conveys, or alt="" when it is decorative.

## jsx_not_lowered

Cause: A JSX expression reached the runtime, which means the lowering in @zerolith/vite did not run for this file.

Fix: Add zerolith() to the Vite plugins and keep JSX in .jsx or .tsx files; without a build step write html templates instead.

## lazy_module_not_split

Cause: A module meant to load as a chunk of its own, a view declared with lazy() from @zerolith/router or a locale of a message index compiled by zerolith-i18n, is also imported statically, so the bundler put it in the importing chunk.

Fix: Remove the static import, or import only its types with import type. Declare the view without lazy() if it should load with the page.

## mount_target_missing

Cause: render or hydrate received a selector that matches no element in the document.

Fix: Check the selector, and mount once the element exists: a module script runs after the document is parsed, so an element earlier in the page is already there.

## on_dispose_outside_scope

Cause: onDispose() was called with no enclosing effect or scope to attach to.

Fix: Call onDispose() inside an effect, a scope(), or a component.

## ref_not_assignable

Cause: A ref binding received something other than a writable signal or a function.

Fix: Pass a signal created with signal<Element | undefined>(undefined) or a callback that receives the element.

## script_in_template

Cause: A template contains a script element.

Fix: Keep scripts in modules; templates describe markup only.

## signal_written_inside_computed

Cause: A signal was written while a computed value was being evaluated.

Fix: Move the write into an effect or an event handler; computed functions must be pure.

## template_frozen_read

Cause: A .get() read is bound in a template, so the value was read once when the template was created and never updates; the Vite plugin reports it in development, since the runtime cannot tell a frozen read from a deliberate one.

Fix: Bind the signal itself, or computed(() => ...) for a derived value; call .get() only inside computed, effect, resource.params, and event handlers.

## template_not_prepared

Cause: A template reached the runtime that the build's prepare pass never saw, in a bundle built without the scanner.

Fix: Build every module that uses html through @zerolith/vite, or pass prepare: false to the plugin to keep the scanner in the bundle.

## template_unclosed_tag

Cause: A template ends inside a tag, attribute, or comment.

Fix: Close the tag or comment inside the same template literal.

## unrenderable_value

Cause: A value of a type the renderer cannot display was bound as content.

Fix: Bind a string, number, signal, template, node, or iterable; call component functions rather than passing them.

## unsafe_attribute_binding

Cause: An attribute binding targets an attribute that runs script or parses HTML.

Fix: Use an @event binding for handlers and child content for markup.

## unsafe_property_binding

Cause: A property binding targets a property that parses its value as HTML.

Fix: Bind child content with ${} instead; for trusted markup use the raw HTML API explicitly.

## unsafe_url_blocked

Cause: A URL attribute received a value with a scheme that can run script, and the attribute was removed.

Fix: Pass http, https, mailto, tel, or a relative URL; data URLs are allowed only for images.
