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
import ArticleSectionGroup from './FullWidthGroup.jsx';
import NavigationBar from './NavigationBar.jsx';
import Article from './Article.jsx';
import MostRead from './MostRead.jsx';
import WeeklyPoll from '../../WeeklyPoll.jsx';
import LeftSectionGroup from './LeftSectionGroup.jsx';
import BottomLeftGroup from './BottomLeftGroup.jsx';
import BottomRightGroup from './BottomRightGroup.jsx';

const Home = () => {  
  return (
    <>
      {/* <Article/> */}
      <Header/>
      {/* <NavigationBar pageNames={["Comics"]}/> */}
      <TopArticle/>
      <List isRow={true} showSection={true} showImage={true} articleList={["SPORTS", "OPINION", "NEWS", "COMICS"]}/>
      <ArticleSectionGroup sectionName={"OPINION"} type={1}></ArticleSectionGroup>
        <div>
            <hr className='border-blue-700'/>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-1 m-1 divide-x divide-blue-700">
                <BottomLeftGroup components={
                  [
                  <LeftSectionGroup sectionName={"entertainment"} type={"5-3"} isReverse={true}/>,
                  <LeftSectionGroup sectionName={"comics"} type={"5-3"}/>,
                  <LeftSectionGroup sectionName={"sports"} type={"4-4"} isReverse={true}/>,
                  <LeftSectionGroup sectionName={"puzzles"} type={"4-4"}/>
                ]
                  }/>

                <BottomRightGroup components={[
                  <MostRead articleList={[1, 2, 3, 4, 5]}/>,
                  /*<WeeklyPoll question={"Scrumptious"} answers={["meow", "meow"]}/>*/
                ]}/>
            </div>
        </div>

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
      
      <Donate/>

    </>
  )
};

export default Home;