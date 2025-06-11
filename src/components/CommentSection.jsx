import { useState, useEffect } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faThumbsUp as faThumbsUpSolid } from '@fortawesome/free-solid-svg-icons'
import { faThumbsUp as faThumbsUpRegular } from '@fortawesome/free-regular-svg-icons'
import { faThumbsDown as faThumbsDownSolid } from '@fortawesome/free-solid-svg-icons'
import { faThumbsDown as faThumbsDownRegular } from '@fortawesome/free-regular-svg-icons'
import { FiShare2 } from 'react-icons/fi'

function SingleComment({timeStr, user, content}) {
    const comment_time = new Date(timeStr);
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(new Date());
        },15000);
        return () => clearInterval(interval);
    }, []);

    const formatMs = (ms) => {
        const sec = Math.floor(ms / 1000);
        const min = Math.floor(sec / 60);
        const hour = Math.floor(min / 60);
        const day = Math.floor(hour / 24);
        const week = Math.floor(day / 7);
        const month = Math.floor(day / 30);
        const year = Math.floor(day / 365);

        if (year >= 1) return `${year} year${year > 1 ? "s" : ""} ago`;
        if (month >= 1) return `${month} month${month > 1 ? "s" : ""} ago`;
        if (week >= 1) return `${week} week${week > 1 ? "s" : ""} ago`;
        if (day >= 1) return `${day} day${day > 1 ? "s" : ""} ago`;
        if (hour >= 1) return `${hour} hour${hour > 1 ? "s" : ""} ago`;
        if (min >= 1) return `${min} minute${min > 1 ? "s" : ""} ago`;
        if (sec >= 1) return `${sec} second${sec > 1 ? "s" : ""} ago`;
        return "just now";
    };

    const duration = now - comment_time;
    return (
            <div className="single-comment">
                <div className = "userInfo">
                    <div className="avatar"></div>
                    <span className="user">{user}</span>
                    <span className="time">{formatMs(duration)}</span>
                </div>
                <p className="comment">{content}</p>
                <div className="actions">
                    <span>Like</span>
                    <span>Reply</span>
                </div>
            </div>
    )
}

function AllComments({cmtList}) {
    if (cmtList.length === 0) return <center className="no-cmt">Be the first to comment.</center>
    return (
        <>
            {[...cmtList].reverse().map((comment, index) => (
                <SingleComment
                    key={index}
                    timeStr={comment.time}
                    user={comment.user}
                    content={comment.content}
                />
            ))}
        </>
    );
}

const CommentSection = () => {
    const [cmt, setCmt] = useState("");
    const [commentList, setCommentList] = useState([
    ]);

    const handleCmtSubmit = (event) => {
        event.preventDefault();
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const formattedNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        let cmtListCopy = [...commentList];
        cmtListCopy.push(
            {
                "user" : "Sample User",
                "content" : cmt,
                "time" : formattedNow
            }
        )
        setCommentList(cmtListCopy);
        setCmt("");
    }
        
        const [liked, setLiked] = useState(false);
        const [disliked, setDisliked] = useState(false);
        const handleLike = () => {
            if (disliked) {
                setDisliked(false);
            }
            setLiked(!liked);
        };
        const handleDislike = () => {
            if (liked) {
                setLiked(false);
            }
            setDisliked(!disliked);
        }

    return (
        <>
            <div className="reaction-container">
                <span title="Like" className="reaction-btn" onClick={handleLike}>{liked ? <FontAwesomeIcon icon={faThumbsUpSolid} /> : <FontAwesomeIcon icon={faThumbsUpRegular} />}<span>Like</span></span>
                <span title="Dislike" className="reaction-btn" onClick={handleDislike}>{disliked ? <FontAwesomeIcon icon={faThumbsDownSolid} /> : <FontAwesomeIcon icon={faThumbsDownRegular} />}<span>Dislike</span></span>
                <span title="Share" className="reaction-btn" onClick={()=>{alert('shared')}}><FiShare2 /><span>Share</span></span>
                <span>{commentList.length} comment{commentList.length !== 1 ? "s" : ""}</span>
            </div>
            <div className = "comments-container">
                <h1 className="bottom-border">Comments</h1>
                <form onSubmit={handleCmtSubmit}>
                    <input type="text" className="comment-input" placeholder="Write a comment..." value={cmt} onChange = {(e) => setCmt(e.target.value)}/>
                </form>
                <div className = "cmt-options">
                    <span>Commenting as <strong>Sample User</strong></span>
                    <select className = "cmt-sort">
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                    </select>
                </div>
                <AllComments cmtList={commentList} />
            </div>
            <style jsx>{`
                @import url("https://fonts.googleapis.com/css?family=Inter:400,700,900&display=swap");
                span,p {
                font-size: 1rem;
                }
                .userInfo {
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: flex-start;
                gap: 0.75rem;
                }
                .avatar {
                    width: 1.5rem;
                    height: 1.5rem;
                    border-radius: 0.75rem;
                    display: inline-block;
                    background-color: #ccc;
                }
                .single-comment {
                    margin: 2rem 0;
                }
                .user {
                    font-weight: 700;
                }
                .time {
                color: #aaa;
                }
                .comment {
                margin: 0.2rem 0;
                }
                .actions {
                display: flex;
                flex-direction: row;
                gap: 1rem;
                }
                .actions span{
                font-weight: 700;
                color: #777;
                }
                .actions span:hover {
                text-decoration: underline;
                cursor: pointer;
                }
                h1 {
                font-weight: 700;
                font-size: 1.5rem;
                }
                .bottom-border {
                padding-bottom: 0.5rem;
                margin-bottom: 1rem;
                border-bottom: solid 1px #ccc;
                }
                .comment-input {
                border: solid 1px #ccc;
                padding: 1rem;
                width: 100%;
                margin-bottom: 0.5rem;
                }
                .comment-input:focus {
                border-color: #555;
                outline: none;
                }
                .no-cmt {
                color: #777;
                margin: 4rem;
                }
                .cmt-options {
                display: flex;
                flex-direction: row;
                justify-content: space-between;
                }
                .cmt-options span {
                color: #777;
                }
                .cmt-sort {
                font-size: 1rem;
                font-weight: 700;
                }
                .reaction-container {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 1.5rem 0;
                }
                .reaction-container > * {
                display: flex;
                flex-direction: row;
                gap: 0.5rem;
                color: #aaa;
                font-size: 1.2rem;
                }
                .reaction-btn:hover > * {
                cursor: pointer;
                text-decoration: underline;
                }
                comment-input::placeholder {
                font-size: 1rem;
                }
            `}</style>
        </>
    );
};

export default CommentSection;