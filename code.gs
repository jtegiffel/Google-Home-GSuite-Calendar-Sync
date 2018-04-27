{
	
    // source original 
    // https://github.com/Integralist/Google-Home-GSuite-Calendar-Sync
    
    
	// how many day's to sync from your G-Suite Calender 
    var syncDays = 1
    var settingsSheet = "G-Suite CalSync"
    
    // do you want to receive e-mails when an event is synced/changed?
    var sendEmailNotification = true 
    
    // do you want to receive e-mails when an event is synced/changed?
	var createCalenderEvents = true
	
	// your company name
	var companyName = "<Your G Suite Company Name>"
	
	// id of spreadsheet (needed to track calendar events)
	var spreadsheetID = "<your_spreadsheet_id>"
	
	// set your personal google account id (i.e. your personal google account email)
	var personalGoogleAccountID = "<your.name>@gmail.com"
	
	// note: this script should be executed within your g suite account for this lookup to work as expected
    var defaultEventTitle = CalendarApp.getDefaultCalendar().getName()
    
	var gSuiteCalendars = [];
	// disable next line if you DON't want to sync your default/main G-Suite calendar
	gSuiteCalendars.push([CalendarApp.getDefaultCalendar().getId(),defaultEventTitle]);
	
	// myFunction is the entry point to this program (and you can't rename this function!?)
	function myFunction() {
		// track when this script was executed
		logTriggerStart()
		
		// acquire a reference to your personal google account calendar
		var personalCalendar = CalendarApp.getCalendarById(personalGoogleAccountID)
		
		try {
			var spreadsheetOpen = SpreadsheetApp.openById(spreadsheetID)
			var spreadsheetName = spreadsheetOpen.getName()
		} catch (e) {
			createSpreadsheet(companyName); return 
		}
		
        var sheet = spreadsheetOpen.getSheetByName(settingsSheet)
		var rows = sheet.getDataRange().getValues()        
		// go over our spreadsheet data (row by row) and search for existing gsuite ids
		rows.forEach(function(row, index){
			// skip the first row (which is just our column headers)
			if (index > 0) {
				var calenderID = row[0]
				gSuiteCalendars.push([calenderID,row[1]]) 
			}
		})
		
		for each (var getCalendar in gSuiteCalendars) {
			var gSuiteCalendar = CalendarApp.getCalendarById(getCalendar[0])
			var sheetName = getCalendar[1]
            if ( sheetName == "" ) { sheetName =  gSuiteCalendar.getName() }
            
			try {
				var sheet = spreadsheetOpen.getSheetByName(sheetName)
                // will trigger an error when sheet doesn't exist
				var dummy = sheet.getSheetName()
			} catch(e) {
				spreadsheetOpen.insertSheet(sheetName);
				var sheet = spreadsheetOpen.getSheetByName(sheetName)
				Logger.log ("created sheet: " + sheet.getSheetName() + " in " + spreadsheetOpen.getName())
				sheet.appendRow(["gsuite_event_id", "personal_event_id", "event_title", "event_start", "event_end"])
			}
			var sheet = spreadsheetOpen.getSheetByName(sheetName)
			
			var trackGSuiteEvents = {}
			for (var i = 0; i < syncDays; i++) {
				// we'll be looking at syncing events for today
				var today = new Date()
				today.setDate(today.getDate() + i)
				
				var gSuiteEvents = gSuiteCalendar.getEventsForDay(today)
				gSuiteEvents.forEach(function(event){
					logEvents(event)
					trackGSuiteEvents[event.getId()] = event
				})
				
			}	
			// acquire data from spreadsheet
			var range = sheet.getDataRange()
			var rows = range.getValues()
			
			// only bother to execute the following code if our spreadsheet has some tracked events
			if (rows.length > 1) {
				// events will be created when not found during checkForEventUpdates
				checkForEventUpdates(rows, trackGSuiteEvents, personalCalendar, personalGoogleAccountID, sheet, companyName)
			} else {
				// No tracked events were found in our spreadsheet, so let's create them...
				generateEvents(trackGSuiteEvents, personalCalendar, personalGoogleAccountID, sheet, companyName)
			}
		}
	}
	
	function logTriggerStart() {
		var d = new Date()
		var hour = d.getHours().toString()
		var minute = d.getMinutes().toString()
		
		Logger.log("Event has been triggered: %s:%s", hour, minute)
	}
	
	function logEvents(e) {
		Logger.log(e)
		Logger.log("\nID: %s\nTitle: %s\nStart: %s\n End: %s", e.getId(), e.getTitle(), e.getStartTime(), e.getEndTime())
	}
	
	function createSpreadsheet(companyName) {
		var sheet = SpreadsheetApp.create(companyName + " G-Suite Calendar Sync To Gmail Calendar")
        sheet.renameActiveSheet(settingsSheet)
		sheet.appendRow(["G-Suite Calendar-ID", "Event-Title-prefix"])
		Logger.log("New spreadsheet created. Replace <spreadsheetID> in this script with: " + sheet.getId())
	}
	
	function checkForEventUpdates(rows, trackGSuiteEvents, personalCalendar, personalGoogleAccountID, sheet, companyName) {
		// track rows that should be deleted
		var oldEvents = []
		
		// loop over the events we have for today
		for (var current_event_id in trackGSuiteEvents) {
			var event_found = false
            
			// go over our spreadsheet data (row by row) and search for existing gsuite ids
			rows.forEach(function(row, index){
				// skip the first row (which is just our column headers)
				if (index > 0) {
					// check for old events and mark them for deletion (otherwise our spreadsheet loop would get longer over time)
					markOldEvents(row, oldEvents, sheet, index)
					
					// assign descriptive names to our spreadsheet data
					var spreadsheet_gsuite_event_id = row[0]
					var spreadsheet_personal_event_id = row[1]
					var spreadsheet_gsuite_event_title = row[2]
					var spreadsheet_gsuite_event_start = row[3]
					
					// is the event we're looking at already tracked?
					if (spreadsheet_gsuite_event_id == current_event_id) {
						event_found = true
						var gsuite_event = trackGSuiteEvents[spreadsheet_gsuite_event_id]
						var time1 = (new Date(gsuite_event.getStartTime())).getTime()
						var time2 = (new Date(spreadsheet_gsuite_event_start)).getTime()
						
						var event_title = sheet.getName() + ": "+ gsuite_event.getTitle()
						if (sheet.getName() == defaultEventTitle) {	var event_title = gsuite_event.getTitle() }
						
						var event_start = new Date(gsuite_event.getStartTime())
						var event_end = new Date(gsuite_event.getEndTime())
						
						var title_changed = event_title != spreadsheet_gsuite_event_title
						var time_changed = time1 != time2
						
						var personalCalendarEvent = personalCalendar.getEventById(spreadsheet_personal_event_id)
						var subject = "Event from your " + companyName + " account has been updated"
						
						if (title_changed && time_changed) {
							updateTitle(personalCalendarEvent, index, sheet, event_title)
							updateDate(personalCalendarEvent, index, sheet, event_start, event_end)
							
							var body_title = "Title was updated from:\n" + spreadsheet_gsuite_event_title + "\n\nto:\n" + event_title + "\n\n"
							var body_event = "Start/End time was updated to:\n\n" + event_start + "\n-\n" + event_end
							var body = body_title + body_event
							if (sendEmailNotification) {GmailApp.sendEmail(personalGoogleAccountID, subject, removeBadSyntax(body))}
						}
						else if (title_changed) {
							updateTitle(personalCalendarEvent, index, sheet, event_title)
							
							var body = "Title was updated from:\n" + spreadsheet_gsuite_event_title + "\n\nto:\n" + event_title
							if (sendEmailNotification) {GmailApp.sendEmail(personalGoogleAccountID, subject, removeBadSyntax(body))}
						}
						else if (time_changed) {
							updateDate(personalCalendarEvent, index, sheet, event_start, event_end)
							
							var body = event_title + "\n\nStart time was updated from:\n\n" + spreadsheet_gsuite_event_start +  "\n\nto:\n\n" + event_start + "\n-\n" + event_end
							if (sendEmailNotification) {GmailApp.sendEmail(personalGoogleAccountID, subject, removeBadSyntax(body))}
						}
					}
				}
			})
			
			// if we didn't find the current event, then create it
			if (!event_found) {
				filtered_event_object = {}
				filtered_event_object[current_event_id] = trackGSuiteEvents[current_event_id]
				generateEvents(filtered_event_object, personalCalendar, personalGoogleAccountID, sheet)
			}
		}
		
		if (oldEvents.length > 0) {
			oldEvents.forEach(function(rowNumber){
				sheet.deleteRow(rowNumber)
			})
		}
	}
	
	function markOldEvents(row, oldEvents, sheet, index) {
		var today = new Date()
		
		// Uncomment following line if you want to test this script for a day in the future
		// today.setDate(today.getDate() + 1)
		
        var compareToday = today.getTime()
        var compareEndTime = new Date(row[4]).getTime()
		
        var storedTitle = row[2]
		
		// if the current event doesn't match today's date, then mark it for deletion
		if (compareEndTime < compareToday) {
			// to avoid marking the same row number multiple times we first check for it
			if (oldEvents.indexOf(index+1) == -1) {
				oldEvents.push(index+1)
			}
		}
	}
	
	function updateTitle(personalCalendar, index, sheet, event_title) {
		var rangeForCurrentEventTitle = sheet.getRange("C" + (index+1))
		sheet.setActiveRange(rangeForCurrentEventTitle)
		rangeForCurrentEventTitle.setValue(event_title)
		personalCalendar.setTitle(event_title)
	}
	
	function updateDate(personalCalendar, index, sheet, event_start, event_end) {
		var rangeForCurrentEventDate = sheet.getRange("D" + (index+1))
		sheet.setActiveRange(rangeForCurrentEventDate)
		rangeForCurrentEventDate.setValue(event_start)
		personalCalendar.setTime(event_start, event_end)
	}
	
	function generateEvents(untrackedEvents, personalCalendar, personalGoogleAccountID, sheet, companyName) {
        // take incoming event object and generate a copy of the events within our personal google calendar
		for (var eventID in untrackedEvents) {
			var event = untrackedEvents[eventID]
			var startTime = new Date(event.getStartTime())
			var endTime = new Date(event.getEndTime())
			var event_title = sheet.getName() + ": "+ event.getTitle()
			if (sheet.getName() == defaultEventTitle) {	var event_title = event.getTitle() }
			var eventDescription = event.getDescription()
            if (createCalenderEvents) {
				var newPersonalEvent = personalCalendar.createEvent(event_title, startTime, endTime, {description: eventDescription})
				// track this new event in our spreadsheet so we can check in future for any changes made to it
				sheet.appendRow([event.getId(), newPersonalEvent.getId(), event_title, startTime, endTime])
			} else {
				sheet.appendRow([event.getId(), "dummy" + event.getId(), event_title, startTime, endTime])
			}
			var body = "Title: " + event_title + "\n\nStarts: " + startTime + "\nEnds: " + endTime + "\n\nDescription:\n" + eventDescription
			
			// send an email to let your personal google account know about the new event added
			var subject = "Event from your " + companyName + " account has been synced"
			// Logger.log(subject + " " + removeBadSyntax(body))
			//GmailApp.sendEmail(personalGoogleAccountID, subject, removeBadSyntax(body))
		}
	}
	
	function removeBadSyntax(b) {
		var newbody = b.replace(/<br>/gi, "\n")
		newbody = newbody.replace(/<a.+?href="([^"]+).+?>.+?<\/a>/gi, "$1")
		return newbody;
	}
}
