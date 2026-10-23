/** The warning their legacy album page gets instead of a table. */

export const legacyNotice = (host: Element): void => {
    const notice = document.createElement("div");

    notice.setAttribute(
        "style",
        [
            "position: fixed;",
            "z-index: 9999;",
            "top: 0.5rem;",
            "right: 0.5rem;",
            "padding: 1rem;",
            "background: #f0f0f0;",
            "border: 1px solid #000;",
            "box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.25);",
            "display: flex;",
            "gap: 1rem;",
            "align-items: flex-start;",
        ].join(""),
    );

    const info = document.createElement("div");
    info.setAttribute(
        "style",
        ["display: flex;", "flex-direction: column;", "gap: 0.25rem;"].join(""),
    );

    const heading = document.createElement("strong");
    heading.textContent = "Genius+ not available";

    const body = document.createElement("span");
    body.textContent = "Legacy album page does not use React.";

    info.append(heading, body);

    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute(
        "style",
        [
            "background: none;",
            "border: none;",
            "width: 1rem;",
            "height: 1rem;",
            "font-size: 1.5rem;",
            "line-height: 1rem;",
            "cursor: pointer;",
        ].join(""),
    );
    close.addEventListener("click", () => {
        notice.remove();
    });

    notice.append(info, close);

    host.append(notice);
};
