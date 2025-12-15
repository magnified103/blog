jQuery(function($) {
    function createLink(url, text) {
        return $("<a>", {
            target: "_blank",
            href: url
        }).append(text)
    }
    $(".project-container");
    const $content = $(".project-showcase").detach().show();
    $(".project:not(.no-preview)").featherlight($content, {
        beforeOpen: function(event) {
            const proj = $(event.target).parents(".project"),
                img = proj.find(".project-preview img");
            $content.find(".showcase-preview").empty().append(createLink(
                proj.find(">a").attr("href"),
                img.clone().attr("src", img.attr("data-src-large") || undefined))
            ),
            $content.find(".showcase-title").html(createLink(
                proj.find(">a").attr("href"),
                proj.find(".project-title").text()
            )),
            $content.find(".showcase-body").empty().append(
                $("<p>").html(proj.find(".project-description").html())
            ),
            $content.find(".showcase-extra").html(proj.find(".project-extra").html() || "")
        }
    }),
    $(".fakelink").on("click", function(t) {
        t.preventDefault(),
        window.open($(this).attr("title"), "_blank")
    })
});
