$(".full img").on("click",function(){$(this).toggleClass("zoom")});


/* For Coveo Search*/

$(window).ready(function(){
    //trackEventsGa();
    //trigger mobile menu
    $(".currentSiteName").click(function(){
        $("+ nav",this).slideToggle();
        $(">span i",this).toggleClass("up");
    });


    $(".upHeader nav ul.menu a,.upHeader .externalbox a").click(function(e){
        if (isMobile()){
            e.preventDefault();
            $(".upHeader nav").slideUp();
            window.open($(this).attr("href"),"_blank");
        }
    });

    //open submenu in connected mode
    $("a.connected").click(function(e){
        e.preventDefault();
        $("+ ul",this).slideToggle();
    });

	$('.show-ot-infoDisplay, a[href$="#ot_toggleInfoDisplay"]').on('click', function(e){
		if(typeof OneTrust !== 'undefined') {
			e.preventDefault();
	  
			OneTrust.ToggleInfoDisplay();
		}
	  });

});

// function trackEventsGa(){
//     //tracking for analytics.js
//     //if ga.js use _gaq.push(['_trackEvent', 'button3', 'clicked']) template
//     $("#jsSupport").click(function(){ ga('send', 'event', 'TopMenus', 'click', 'Support');});
//     $("#jsProductDocs").click(function(){ ga('send', 'event', 'TopMenus', 'click', 'Product docs');});
//     $("#jsDevDocs").click(function(){ ga('send', 'event', 'TopMenus', 'click', 'Dev docs');});
//     $("#jsAnswers").click(function(){ ga('send', 'event', 'TopMenus', 'click', 'Answers');});
//     $("#jsTraining").click(function(){ ga('send', 'event', 'TopMenus', 'click', 'Training');});
//     $("#jsCloudAdminV1").click(function(){ ga('send', 'event', 'TopMenus', 'click', 'Cloud Admin V1');});
//     $("#jsCloudAdminV2").click(function(){ ga('send', 'event', 'TopMenus', 'click', 'Cloud Admin V2');});
//     $("#jsTechBlog").click(function(){ ga('send', 'event', 'TopMenus', 'click', 'Tech Blog');});
// }



//Mobile detection
function isMobile(){
    if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
        return true;
    }
}




// Set the Coveo Cloud Organization search and analytics tokens
var siteOrigin= 'TechBlog'; // Telling support.coveo.com where the search request comes from
var uaTokenCloudV1 = '7b9b9300-3901-437b-bafd-51ae596f1b16'; // API Key for allowing to push Usage analytics events
var uaToken = 'xx15d10ab2-cb6c-4c13-addb-aa871471c00e'
var SuggestionScope = '@syssource=("source.coveo.com")'; //Search Box suggestion filter ex: @syssource=("ohclouden")
var searchTokenCloudV1 = '7b9b9300-3901-437b-bafd-51ae596f1b16'; //API Key allowing to query
var searchToken = 'xx15d10ab2-cb6c-4c13-addb-aa871471c00e';
var hostname = window.location.hostname; //To manage dev/staging/prod environment
var TechDocSearchPage = 'https://connect.coveo.com/s/global-search/%40uri';

$(function(){
	Coveo.SearchEndpoint.endpoints["default"] = new Coveo.SearchEndpoint({
		restUri: 'https://coveosearch.org.coveo.com/rest/search',
		accessToken: searchToken
		});
	Coveo.$("#searchBox").on("afterInitialization", function(){
		Coveo.$("#searchBox").coveo('state', 'site', siteOrigin);
	});
	Coveo.$('#searchBox').coveo('initSearchbox', TechDocSearchPage, {
		FieldSuggestions: {
			omniboxSuggestionOptions: {
			onSelect: function (valueSelected, populateOmniBoxEventArgs) {
				populateOmniBoxEventArgs.closeOmnibox();
				Coveo.SearchEndpoint.endpoints["default"]
					.search({
						q: '@techblogtitle=="' + valueSelected + '"',
						aq: SuggestionScope
					})
					.done(function (results) {
						/*window.location = results.results[0].clickUri;*/
						var foundResult = Coveo._.find(results.results, function(result){
							return valueSelected == result.raw.techblogtitle;
						});
						if(foundResult){
							//logCustomEvent('pageNav', 'omniboxTitleSuggestion', uaToken, foundResult.Title, foundResult.clickUri);
							//console.log('Navigation type, label, target: ' + 'omniboxTitleSuggestion' + ' | ' + foundResult.Title + ' | ' + foundResult.clickUri);
							window.location = foundResult.clickUri;
						} else {
							logger.warn("Selected suggested result," + valueSelected + ", not found.");
						}
					})
				},
				queryOverride: SuggestionScope
			}
		}
	});
});
