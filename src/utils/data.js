export function getTheExcerpt(text, num_words = 30){
    return text.replace(/<[^>]*>?/gm, '').split(" ").slice(0, num_words).join(" ") + "...";
}