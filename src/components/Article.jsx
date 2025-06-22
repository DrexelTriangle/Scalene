import Header from './Header.jsx';
import CommentSection from './CommentSection.jsx';

const Article = () => {  

  return (
    <>
      <div style={{ height: '2rem' }}></div>
      <Header/>
      <div className = "generic">
        <div>
          <i className="topic">TOPIC NAME</i>
          <h1 className="title" >Maybe a long title right here (I'm making it longer)</h1>
        </div>
        <div className="byline">
          <span>By First Last</span>
          <span>Month DD, YYYY</span>
        </div>
      </div>
      <div className = "article-container">
        <div className="main-article">
          <img className="image" src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Mario_the_Magnificent.jpg/2560px-Mario_the_Magnificent.jpg" />
          <text className="image-credits">Photo by Someone | Some Source</text>
          <div className="content">
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
            <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
            <p>Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.</p>
            <p>Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam.</p>
            <p>Maecenas fermentum consequat mi. Donec fermentum. Pellentesque malesuada nulla a mi. Duis sapien sem, aliquet nec, commodo eget, consequat quis, neque. Aliquam faucibus, elit ut dictum aliquet, felis nisl adipiscing sapien, sed malesuada diam lacus eget erat.</p>
            <p>Praesent dapibus, neque id cursus faucibus, tortor neque egestas augue, eu vulputate magna eros eu erat. Aliquam erat volutpat. Nam dui mi, tincidunt quis, accumsan porttitor, facilisis luctus, metus.</p>
            <p>Phasellus ultrices nulla quis nibh. Quisque a lectus. Donec consectetuer ligula vulputate sem tristique cursus. Nam nulla quam, gravida non, commodo a, sodales sit amet, nisi.</p>  
          </div>
          <CommentSection/>
        </div>
        <div className = "divider"></div>
        <div className = "column-content"></div>
      </div>

      {/* Stylesheet Temp */}
      <style jsx>{`
      @import url('https://fonts.googleapis.com/css?family=Roboto+Slab:400,700,900&display=swap');
      @import url('https://fonts.googleapis.com/css?family=Playfair+Display:400,700,900&display=swap');
      @import url('https://fonts.googleapis.com/css?family=Crimson+Text:400,700,900&display=swap');
        p {
          font-family: "Crimson Text", serif;
        }
        .topic {
        font-size: 1rem;
        line-height: 200%;
        }
        .title {
        font-weight: 600;
        font-style: italic;
        font-size: 2.5rem;
        line-height: 115%;
        font-family: "Playfair Display", serif;
        }
        .byline {
          border-top: 1px solid #ccc;
          border-bottom: 1px solid #ccc;
          margin: 1rem 0;
          padding: 1rem 0;
          display: flex;
          justify-content: flex-start;
          gap: 1rem;
        }
        .byline > * {
          font-family: "Roboto Slab", serif;
          font-size: 0.8rem;
        }
        .image-credits {
          color: #ccc;
          line-height: 200%;
          font-size: 1rem;
          font-style: italic;
        }
        .content > * {
        font-size: 1.2rem;
        margin: 1rem 0;
        }
        .divider {
          margin: 0 1.5rem;
          width: 0.2rem;
          background-color: #ccc;
        }
        .column-content {
          width: 1200px;
        }
        .article-container {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: space-between;
        }
        
        @media (max-width: 978px), (orientation: portrait) {
          html {
            font-size: 30px;}
          }
          .divider {
            display: none;
          }
          .column-content {
            display: none;
          }
        }

      `}
      </style>
    </>
  );
};

export default Article;