import Header from './Header.jsx';
import Donate from './Donate.jsx';
import About from './About.jsx';
import Classifieds from './Classifieds.jsx';
import JoinTheTriangle from './JoinTheTriangle.jsx';
import PhotoGallery from './PhotoGallery.jsx';
import Staff from './Staff.jsx';
import FindATriangle from './FindATriangle.jsx';
import ContactTheTriangle from './ContactTheTriangle.jsx';
import TopArticle from './TopArticles.jsx';
import List from './List.jsx';
import ArticleSectionGroup from './ArticleSectionGroup.jsx';
import NavigationBar from './NavigationBar.jsx';
import Article from './Article.jsx';

const Home = () => {  
  return (
    <>
      {/* <Article/> */}
      <Header/>
      <NavigationBar pageNames={["Comics"]}/>
      <TopArticle/>
      <List isRow={true} showSection={true} showImage={true} articleList={["SPORTS", "OPINION", "NEWS", "COMICS"]}/>
      <ArticleSectionGroup sectionName={"OPINION"} type={1}></ArticleSectionGroup>
      <ArticleSectionGroup sectionName={"ENTERTAINMENT"} type={2}></ArticleSectionGroup>
      
      {/*
      <Donate/>
      <About/>
      <Classifieds/>
      <JoinTheTriangle/>
      <PhotoGallery/>
      <Staff/>
      <FindATriangle/>
      <ContactTheTriangle/>
      */}
    </>
  )
};

export default Home;