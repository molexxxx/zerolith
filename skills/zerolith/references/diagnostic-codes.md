<!-- Generated from the runtime's diagnostic catalog by npm run skills. -->

# Diagnostic codes

Every error and warning zerolith reports carries one of these codes and a link to https://zerolith.dev/e/<code>/. Apply the fix the code names; never silence it.

## binding_in_comment

Cause: An expression appears inside an HTML comment.

Fix: Remove the expression from the comment; comments are static.

## binding_in_raw_text

Cause: An expression appears inside an element whose content is raw text.

Fix: Set the content of style, textarea, and title elements through a .textContent or .value property binding instead.

## binding_in_tag_position

Cause: An expression appears where a tag or attribute name is expected.

Fix: Bind values only as element content or inside an attribute value; tag and attribute names must be static.

## binding_in_template_element

Cause: A binding sits inside a <template> element, whose content the browser does not render, so the client could not bind it while the server would render it.

Fix: Move the binding out of the <template> element, or build that content with html when it is needed.

## binding_not_single

Cause: A boolean attribute, property, or event binding has more than one expression or extra text.

Fix: Bind exactly one expression with nothing around it, for example ?disabled=${flag}.

## boundary_caught

Cause: A boundary's content threw as it rendered, or an effect, binding, row, or branch inside it threw as it ran, and the boundary shows its fallback in the content's place.

Fix: Fix the error, which the boundary also logs with console.error, stack and all, in production too; until then the boundary keeps the rest of the page running, and its fallback's retry renders the content again.

## button_without_name

Cause: A <button> has no content and no aria-label, so it has no accessible name.

Fix: Put text inside the button, or add aria-label; an icon alone needs the label.

## computed_cycle

Cause: A computed value read itself, directly or through other computed values.

Fix: Break the cycle, for example by reading the previous value inside untracked().

## css_value_not_allowed

Cause: A css literal received a value that is not a number or another css result.

Fix: Interpolate only numbers and css results; put dynamic values in custom properties set through a style binding.

## each_items_function

Cause: each() received a function as its items. It reads a signal or an array, so a function would render no rows.

Fix: Pass a signal or a computed value, for example each(computed(() => items.get().filter(open)), (item) => item.id, Row).

## each_key_duplicate

Cause: Two items in an each() list produced the same key.

Fix: Return a key that is unique within the list; duplicates make rows indistinguishable.

## each_key_undefined

Cause: The key function passed to each() returned undefined for an item.

Fix: Return a stable string or number per item, such as its id.

## effect_async

Cause: An effect function returned a promise, so the signals it reads after its first await are not tracked and the promise is not a cleanup.

Fix: Keep the effect function synchronous: start the asynchronous work inside it and return the function that stops it.

## effect_loop

Cause: Effects kept re-triggering each other for more than 100 rounds in one batch; the effect that was writing is disposed.

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

## in_view_options_invalid

Cause: inView was given a threshold outside 0 to 1, or a root margin the browser refuses, so no IntersectionObserver can be made from them.

Fix: Give threshold as a fraction of the element that must show, 0 for any part to 1 for all of it, and rootMargin in pixels or percent as CSS writes them, such as "200px" or "0px 0px 25% 0px".

## jsx_not_lowered

Cause: A JSX expression reached the runtime, which means the lowering in @zerolith/vite did not run for this file.

Fix: Add zerolith() to the Vite plugins and keep JSX in .jsx or .tsx files; without a build step write html templates instead.

## lazy_module_not_split

Cause: A module meant to load as a chunk of its own, a view declared with lazy() from @zerolith/router or a locale of a message index compiled by zerolith-i18n, is also imported statically, so the bundler put it in the importing chunk.

Fix: Remove the static import, or import only its types with import type. Declare the view without lazy() if it should load with the page.

## mount_component_uncalled

Cause: render(), hydrate(), or renderToString() received a component that takes props, passed instead of called, so it would run without them.

Fix: Pass a function that calls the component, for example render(() => Counter({ start: 1 }), "#app").

## mount_target_missing

Cause: render or hydrate received a selector that matches no element in the document.

Fix: Check the selector, and mount once the element exists: a module script runs after the document is parsed, so an element earlier in the page is already there.

## on_dispose_outside_scope

Cause: onDispose() was called with no enclosing effect or scope to attach to.

Fix: Call onDispose() inside an effect, a scope(), or a component.

## package_version_mismatch

Cause: A package released together with zerolith, such as @zerolith/vite, @zerolith/devtools, or the command line, met a zerolith of another version. They share the zerolith/internal entry, which can change with every version, so each requires the zerolith of its own version.

Fix: Give zerolith and every @zerolith package the project uses the same version and install again; the message names both versions, and npm ls zerolith shows what is installed and what requires it.

## ref_not_assignable

Cause: A ref binding received something other than a writable signal or a function.

Fix: Pass a signal created with signal<Element | undefined>(undefined) or a callback that receives the element.

## resource_timed_out

Cause: A run of the resource's loader did not settle within the timeout, so its abort signal fired and the run failed.

Fix: Pass the loader's abort signal to fetch so the request itself stops, raise the timeout for a slow backend, or add retry so a run that fails now and then is tried again.

## route_name_unknown

Cause: href() of @zerolith/router was called with a name the route table does not hold, so there is no path to build.

Fix: Use a name the table passed to createRouter declares; the message names the one given, and TypeScript rejects it in a typed project.

## route_path_invalid

Cause: A route's path names a parameter the matcher cannot read as written: a *rest segment that is not the last, a second *rest, a parameter with no name, or a modifier such as ? after a name.

Fix: Write the path with static segments, :name parameters, and at most one *rest at the end; the message names the route and its path.

## script_in_template

Cause: A template contains a script element.

Fix: Keep scripts in modules; templates describe markup only.

## signal_written_inside_computed

Cause: A signal was written while a computed value was being evaluated.

Fix: Move the write into an effect or an event handler; computed functions must be pure.

## state_key_duplicate

Cause: A second stored signal was created for the key while the first is live; each writes its own value and neither hears the other, since the storage event tells other tabs alone.

Fix: Create a stored signal once per key, at module level or in the app's root, and share it; one created inside a component goes with the component, so create the next after that one is disposed.

## state_storage_unavailable

Cause: The page has no storage of that kind, or refused the write, so the stored signal keeps its value in memory alone.

Fix: On the server, read the signal's initial value and let the browser take over; in a browser that refuses storage, such as a private window with it off, the signal still works for the page.

## state_storage_unreadable

Cause: The value kept in storage under the key does not parse as JSON, or the stored signal's validate option refuses it, so the signal takes its initial value.

Fix: Clear the key, or write it as JSON that validate accepts; a value written by other code under the same key is read as this signal's.

## state_store_assigned

Cause: A field of a store, or of an object or array inside it, was assigned, deleted, or defined directly, which a store refuses so every change is made through its setter.

Fix: Call the store's setter with the path and the value, for example setBoard("rows", 3, "label", "renamed").

## state_store_path_missing

Cause: A store's setter was given a path through a value that is not an object or an array, so the field to change does not exist.

Fix: Set the object or array at that point of the path first, or shorten the path to a field that holds one.

## state_value_not_json

Cause: The stored signal's value does not serialize as JSON, so it is kept in memory alone and storage still holds the value before it.

Fix: Keep JSON values in a stored signal: objects, arrays, strings, numbers, booleans, and null; convert a BigInt or a cyclic object first.

## template_component_uncalled

Cause: A function named like a component is bound as a template's content without being called, as ${AddItem}, which the renderer cannot display; `zerolith lint` and the Vite plugin report it before the code runs, since the type checker cannot tell it from an event handler.

Fix: Call it, as ${AddItem()}, or write <AddItem /> in JSX.

## template_frozen_read

Cause: A .get() read is bound in a template, so the value was read once when the template was created and never updates; `zerolith lint` and the Vite plugin report it before the code runs, since the runtime cannot tell a frozen read from a deliberate one.

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

Cause: A URL attribute or property received a value with a scheme that can run script, and the attribute was removed.

Fix: Pass http, https, mailto, tel, or a relative URL; a data URL is allowed only for a PNG, GIF, JPEG, WebP, AVIF, BMP, or icon image, since an SVG can carry script.

## when_condition_function

Cause: when() received a function as its condition. A function is always truthy, so the first branch would always show.

Fix: Pass a signal or a computed value, for example when(computed(() => items.get().length === 0), Empty).
